import React, { useState, useEffect, useMemo, memo, useCallback, useRef, lazy, Suspense } from 'react';
import { SpinnerIcon, Image3DIcon } from './icons';
// Fix: Import Language type from translations.ts to avoid circular dependencies.
import { translations, type Language } from '../translations';
import { getProcessedStructure, decode, decodeAudioData } from '../utils';
import { generateSpeech, generateAlbumArt, RateLimitError } from '../geminiService';
import { FormState } from './InputForm';
import type { AlbumArtSettings } from './AlbumArtGeneratorModal';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';

const AlbumArtGeneratorModal = lazy(() => import('./AlbumArtGeneratorModal').then(module => ({ default: module.AlbumArtGeneratorModal })));

interface SongDisplayProps {
  songData: string | null;
  isLoading: boolean;
  watermark: string;
  songStructure: string[];
  onRemix: () => void;
  inputs: FormState | null;
}

type CopyTarget = 'title' | 'style' | 'lyrics' | 'all';
type AudioState = 'idle' | 'loading' | 'playing' | 'error';
type ArtState = 'idle' | 'loading' | 'generated' | 'error';

// Centralized regex and key creation from translations
const ALL_META_KEYS = Object.values(translations).flatMap(t => [
    t.prompts.label_song_title,
    t.prompts.label_style,
    t.prompts.label_vocal_gender,
    t.prompts.weirdnessLabel,
    t.prompts.styleInfluenceLabel
]);

const createDynamicRegex = (getLabel: (t: (typeof translations)[Language]) => string): RegExp => {
    const labels = Object.values(translations).map(t => getLabel(t).slice(0, -1)).join('|');
    return new RegExp(`^(${labels}):\\s*(.*)`, 'm');
};

const TITLE_REGEX = createDynamicRegex(t => t.prompts.label_song_title);
const STYLE_REGEX = createDynamicRegex(t => t.prompts.label_style);
const LYRICS_HEADER_REGEX = createDynamicRegex(t => t.prompts.label_lyrics);


const LoadingState: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex flex-col justify-center items-center h-full text-center p-8">
        <SpinnerIcon className="w-8 h-8 text-[var(--color-primary-brand)] animate-spin" />
        <p className="text-lg font-semibold text-[var(--color-primary-brand)] mt-6 transition-opacity duration-500">{message}</p>
        <p className="text-sm text-[var(--color-text-tertiary)]">{translations['en'].ui.displayPlaceholder2}</p>
    </div>
);


const InitialPlaceholder: React.FC<{ t: (typeof translations)[Language]['ui'] }> = ({ t }) => (
    <div className="text-center text-[var(--color-text-tertiary)] h-full flex flex-col justify-center items-center p-8">
        <div className="placeholder-icon-container-3d mb-6">
            <Image3DIcon />
        </div>
        <p className="text-lg font-semibold text-[var(--color-text-secondary)]">{t.displayPlaceholder1}</p>
        <p className="text-sm">{t.displayPlaceholder2}</p>
    </div>
);


const FormattedLine: React.FC<{ line: string }> = ({ line }) => {
    if (ALL_META_KEYS.some(key => line.startsWith(key))) {
        return <p className="text-base text-[var(--color-text-primary)]">{line}</p>;
    }
    
    const duetMatch = line.match(/^\((Male|Female|Duet|ชาย|หญิง|คู่)\):\s*(.*)/i);
    if (duetMatch) {
        const singerRaw = duetMatch[1];
        const lyric = duetMatch[2];
        let colorClass = 'text-[var(--color-text-secondary)]';
        const lowerCaseSinger = singerRaw.toLowerCase();
        if (['male', 'ชาย'].includes(lowerCaseSinger)) colorClass = 'text-[var(--color-accent-cyan)]';
        if (['female', 'หญิง'].includes(lowerCaseSinger)) colorClass = 'text-[var(--color-primary-brand)]';
        if (['duet', 'คู่'].includes(lowerCaseSinger)) colorClass = 'text-[var(--color-text-secondary)]';

        return (
            <p className="text-[var(--color-text-primary)] leading-relaxed">
                <span className={`font-semibold mr-2 ${colorClass}`}>{`(${singerRaw}):`}</span>
                <span>{lyric}</span>
            </p>
        );
    }

    if (line.startsWith('[') && line.includes(']')) {
        return <p className="font-bold text-[var(--color-accent-cyan)] mb-2 mt-6 text-sm">{line}</p>;
    }
    if (LYRICS_HEADER_REGEX.test(line.trim())) {
        const key = line.split(':')[0];
        return <p className="font-semibold text-gradient text-xl mt-8 mb-2 border-t border-[var(--color-border)] pt-6">{key}</p>
    }
     if (line.trim() === ']') {
        return null;
    }
    return <p className="text-[var(--color-text-primary)] leading-relaxed">{line}</p>;
};

export const SongDisplay: React.FC<SongDisplayProps> = memo(({ songData, isLoading, watermark, songStructure, onRemix, inputs }) => {
    const { language, setRateLimitError } = useAppContext();
    const t = useMemo(() => translations[language].ui, [language]);
    const { showToast } = useToast();
    const [loadingMessage, setLoadingMessage] = useState(t.loadingMessages[0]);
    
    const [audioState, setAudioState] = useState<AudioState>('idle');
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    
    const [artState, setArtState] = useState<ArtState>('idle');
    const [albumArt, setAlbumArt] = useState<string | null>(null);
    const [artError, setArtError] = useState<string | null>(null);
    const [isArtModalOpen, setIsArtModalOpen] = useState(false);

    const processedWatermark = useMemo(() => {
        if (!watermark.trim() || !songData) return watermark;

        const titleMatch = songData.match(TITLE_REGEX);
        const styleMatch = songData.match(STYLE_REGEX);

        let processed = watermark;
        if (titleMatch?.[2]) {
            processed = processed.replace(/\{title\}/g, titleMatch[2].trim());
        }
        if (styleMatch?.[2]) {
            processed = processed.replace(/\{style\}/g, styleMatch[2].trim());
        }
        return processed;
    }, [watermark, songData]);

    const handleStopAudio = useCallback(() => {
        if (audioSourceRef.current) {
            audioSourceRef.current.onended = null;
            try {
                audioSourceRef.current.stop();
            } catch (e) {
                // Ignore errors if stop is called on an already stopped source
            }
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
           audioContextRef.current.close();
           audioContextRef.current = null;
        }
        setAudioState('idle');
    }, []);

    // Reset album art when a new song is generated
    useEffect(() => {
        if (isLoading) {
            setAlbumArt(null);
            setArtState('idle');
            setArtError(null);
        }
    }, [isLoading]);


    useEffect(() => {
      let interval: ReturnType<typeof setInterval> | undefined;
      if (isLoading) {
          handleStopAudio();
          setLoadingMessage(t.loadingMessages[0]); // Reset to first message on new load
          interval = setInterval(() => {
              setLoadingMessage(prev => {
                  const currentIndex = t.loadingMessages.indexOf(prev);
                  const nextIndex = (currentIndex + 1) % t.loadingMessages.length;
                  return t.loadingMessages[nextIndex];
              });
          }, 2500);
      }
      return () => {
          if (interval) {
              clearInterval(interval);
          }
      };
    }, [isLoading, t.loadingMessages, handleStopAudio]);

    // Effect to cleanup audio on component unmount or when song changes
    useEffect(() => {
        return () => {
            handleStopAudio();
        }
    }, [songData, handleStopAudio]);

    const handleListen = async () => {
        if (audioState === 'playing') {
            handleStopAudio();
            return;
        }

        if (!songData || !inputs) return;

        setAudioState('loading');

        try {
            const base64Audio = await generateSpeech(songData, { selectedVocal: inputs.selectedVocal }, language);
            
            if (!base64Audio) {
                throw new Error("AI did not return audio data.");
            }

            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const decodedBytes = decode(base64Audio);
            const audioBuffer = await decodeAudioData(decodedBytes, audioContextRef.current, 24000, 1);
            
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
            
            audioSourceRef.current = source;
            setAudioState('playing');
            
            source.onended = () => {
                if (audioSourceRef.current === source) {
                   handleStopAudio();
                }
            };

        } catch (err) {
            console.error("Audio generation error:", err);
            if (err instanceof RateLimitError) {
                setRateLimitError(err.message);
                setAudioState('idle'); // Reset button state
            } else {
                const errorMessage = err instanceof Error ? err.message : t.audioErrorGeneral;
                showToast(errorMessage, 'error');
                setAudioState('error');
                setTimeout(() => setAudioState('idle'), 3000);
            }
        }
    };

    const handleGenerateArtRequest = async (settings: AlbumArtSettings) => {
        setArtState('loading');
        setArtError(null);
        setIsArtModalOpen(false);
        try {
            const artData = await generateAlbumArt(settings, language);
            setAlbumArt(`data:image/png;base64,${artData}`);
            setArtState('generated');
        } catch (err) {
            console.error("Album art generation error:", err);
            if (err instanceof RateLimitError) {
                setRateLimitError(err.message);
                setArtState('idle'); // Reset art state
            } else {
                const errorMessage = err instanceof Error ? err.message : t.artErrorGeneral;
                setArtError(errorMessage);
                setArtState('error');
            }
        }
    };
    
    const handleDownloadArt = () => {
        if (albumArt) {
            const link = document.createElement('a');
            link.href = albumArt;
            
            const titleMatch = songData?.match(TITLE_REGEX);
            const title = titleMatch ? titleMatch[2].trim().replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'album_art';
            link.download = `${title}.png`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const parsedSong = useMemo(() => {
        if (!songData) return null;
    
        // Find where the main content (lyrics or structure) begins
        const lyricsStartIndex = songData.search(LYRICS_HEADER_REGEX);
        
        let metaDataString = songData;
        let lyricsString = "";

        if (lyricsStartIndex !== -1) {
            metaDataString = songData.substring(0, lyricsStartIndex);
            lyricsString = songData.substring(lyricsStartIndex);
        }

        // Filter out any potential chord lines from old history items
        const metaData = metaDataString.split('\n')
            .filter(line => !line.match(/^(Chord Progression:|คอร์ดโปรเกรสชั่น:|和弦进行:|コード進行:|코드 진행:)/))
            .filter(line => line.trim() !== '');

        // Now parse the lyrics string into sections
        const cleanedSongData = lyricsString.replace(LYRICS_HEADER_REGEX, (match) => `${match.trim()}\n[`);
        const lines = cleanedSongData.split('\n');
    
        let foundSections: { type: string, content: string[] }[] = [];
        let currentSection: { type: string, content: string[] } | null = null;
    
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine === '') continue;
    
            if (trimmedLine.startsWith('[') && trimmedLine.includes(']')) {
                currentSection = { type: trimmedLine, content: [] };
                foundSections.push(currentSection);
            } else if (LYRICS_HEADER_REGEX.test(trimmedLine)) {
                if (currentSection) {
                    currentSection = null;
                }
                foundSections.push({ type: 'lyrics-header', content: [trimmedLine] });
            } else if (currentSection) {
                currentSection.content.push(line);
            }
        }
        
        let sections = foundSections;
        if (songStructure && songStructure.length > 0) {
            const getBasePart = (part: string): string => {
                if (!part) return '';
                return part.substring(1, part.length - 1).replace(/\s*\d+\s*$/, '').trim();
            };
    
            const availableSections = [...sections]; // Make a mutable copy
            const reorderedSections: { type: string, content: string[] }[] = [];
    
            const lyricsHeaderIndex = availableSections.findIndex(s => s.type === 'lyrics-header');
            if (lyricsHeaderIndex > -1) {
                reorderedSections.push(availableSections[lyricsHeaderIndex]);
                availableSections.splice(lyricsHeaderIndex, 1);
            }
            
            const orderedStructureKeys = getProcessedStructure(songStructure);
    
            orderedStructureKeys.forEach(userKey => {
                const userBaseKey = getBasePart(userKey);
                const foundIndex = availableSections.findIndex(aiSection => getBasePart(aiSection.type) === userBaseKey);
                
                if (foundIndex !== -1) {
                    reorderedSections.push(availableSections[foundIndex]);
                    availableSections.splice(foundIndex, 1);
                }
            });
            
            if (availableSections.length > 0) {
                reorderedSections.push(...availableSections);
            }
    
            sections = reorderedSections;
        }
    
        return { metaData, sections };
    }, [songData, songStructure]);
    
    const handleCopy = useCallback((target: CopyTarget) => {
        if (!songData || !parsedSong) return;

        let textToCopy = '';
        const lyricsStartIndex = songData?.search(/\[.*?\]/);
        const titleMatch = songData?.match(TITLE_REGEX);
        const styleMatch = songData?.match(STYLE_REGEX);

        switch (target) {
            case 'title':
                textToCopy = titleMatch ? titleMatch[2].trim() : '';
                break;
            case 'style':
                textToCopy = styleMatch ? styleMatch[2].trim() : '';
                break;
            case 'lyrics':
                 if (lyricsStartIndex !== -1 && songData) {
                    const lyricsText = songData.substring(lyricsStartIndex).trim();
                    textToCopy = processedWatermark.trim() ? `${lyricsText}\n\n---\n${processedWatermark}` : lyricsText;
                }
                break;
            case 'all':
            default:
                textToCopy = processedWatermark.trim() ? `${songData}\n\n---\n${processedWatermark}` : songData ?? '';
                break;
        }

        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy.trim());
            showToast(t.copySuccess, 'success');
        }
    }, [songData, processedWatermark, parsedSong, showToast, t.copySuccess]);

    const handleShare = useCallback(async () => {
        if (!songData) return;
    
        const titleMatch = songData.match(TITLE_REGEX);
        const title = titleMatch ? titleMatch[2].trim() : t.shareTitle;
        const textToShare = processedWatermark.trim() ? `${songData}\n\n---\n${processedWatermark}` : songData;
    
        // Use Web Share API if available
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title,
                    text: textToShare,
                });
            } catch (error) {
                 if (error instanceof Error && error.name !== 'AbortError') {
                   console.error('Error sharing:', error);
                   showToast(`Error sharing: ${error.message}`, 'error');
                }
            }
        } else {
            // Fallback for desktop or browsers that don't support Web Share API
            handleCopy('all');
            showToast(t.copySuccessShare, 'info');
        }
    }, [songData, processedWatermark, t.shareTitle, t.copySuccessShare, handleCopy, showToast]);
    
    const renderContent = () => {
        if (isLoading) {
            return <LoadingState message={loadingMessage} />;
        }
        if (!isLoading && !songData) {
             return ( <InitialPlaceholder t={t} /> );
        }
        if (parsedSong) {
            const { metaData, sections } = parsedSong;
            
            const CopyButton = ({ target, text }: { target: CopyTarget, text: string }) => (
                <button
                    onClick={() => handleCopy(target)}
                    className="btn btn-secondary !px-3 !py-1.5 !text-xs flex-1 min-w-[80px]"
                >
                    {text}
                </button>
            );

            const ListenButton = () => {
                let text, style;
                switch (audioState) {
                    case 'loading':
                        text = t.loadingAudioButton;
                        style = 'text-[var(--color-text-secondary)]';
                        break;
                    case 'playing':
                        text = t.stopAudioButton;
                        style = 'btn-secondary text-[var(--color-accent-cyan)] border-[var(--color-accent-cyan)]/30 hover:border-[var(--color-accent-cyan)]/50';
                        break;
                    case 'error':
                        text = t.listenButton;
                        style = 'btn-secondary text-[var(--color-error)] border-[var(--color-error)]/30';
                        break;
                    case 'idle':
                    default:
                        text = t.listenButton;
                        style = 'btn-secondary text-[var(--color-accent-cyan)] border-[var(--color-accent-cyan)]/30 hover:border-[var(--color-accent-cyan)]/50';
                }

                return (
                     <button
                        onClick={handleListen}
                        disabled={!songData || audioState === 'loading'}
                        className={`btn !py-2.5 !text-sm w-full ${style}`}
                    >
                        {audioState === 'loading' && <SpinnerIcon className="w-5 h-5 mr-2 animate-spin" />}
                        <span>{text}</span>
                    </button>
                );
            };

            const renderMediaArea = () => {
                // Album Art
                if (artState === 'generated' && albumArt) {
                    return <img src={albumArt} alt={t.shareTitle} className="w-full h-full object-contain shadow-lg" />;
                }
                if (artState === 'loading') {
                    return (
                        <div className="flex flex-col justify-center items-center text-center">
                            <SpinnerIcon className="w-8 h-8 text-[var(--color-primary-brand)] animate-spin" />
                            <p className="text-sm text-[var(--color-primary-brand)] mt-4">{t.generatingArtButton}</p>
                        </div>
                    );
                }
                if (artState === 'error' && artError) {
                     return (
                         <div className="text-center text-[var(--color-error)] p-4">
                            <h3 className="font-bold mb-2">{t.artErrorTitle}</h3>
                            <p className="text-xs">{artError}</p>
                        </div>
                    );
                }
                
                // Default placeholder
                return (
                    <div className="flex flex-col justify-center items-center text-center text-[var(--color-text-tertiary)]">
                        <div className="placeholder-icon-container-3d">
                            <Image3DIcon />
                        </div>
                        <p className="text-sm mt-4">{t.displayPlaceholder1}</p>
                    </div>
                );
            };

            return (
                <>
                <div className="animate-reveal relative h-full flex flex-col">
                    <div className="p-4 sm:p-6 flex justify-center items-center aspect-square bg-black/20 rounded-t-xl">
                        {renderMediaArea()}
                    </div>

                    <div className="flex-shrink-0 p-4 border-y border-[var(--color-border)] flex flex-col gap-3">
                        {/* Media & Song Actions */}
                        <div className="grid grid-cols-2 gap-2">
                           {/* Media Actions */}
                            <div className="flex flex-col gap-2">
                                <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider text-center">Media</p>
                                <button onClick={() => setIsArtModalOpen(true)} disabled={artState === 'loading' || !inputs} className="btn btn-secondary !text-sm">
                                    {artState === 'loading' && <SpinnerIcon className="w-4 h-4 mr-2 animate-spin"/>}
                                    <span>{artState === 'loading' ? t.generatingArtButton : t.generateArtButton}</span>
                                </button>
                                {artState === 'generated' && albumArt && (
                                    <button onClick={handleDownloadArt} className="btn btn-secondary !text-sm">
                                        <span>{t.downloadArtButton}</span>
                                    </button>
                                )}
                                <ListenButton />
                            </div>

                             {/* Song Actions */}
                            <div className="flex flex-col gap-2">
                                 <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider text-center">Song Actions</p>
                                <button onClick={onRemix} className="btn btn-secondary !text-sm">
                                    <span>{t.remixButton}</span>
                                </button>
                                <button onClick={handleShare} className="btn btn-secondary !text-sm">
                                    <span>{t.shareButton}</span>
                                </button>
                            </div>
                        </div>

                         {/* Copy Actions */}
                         <div className="grid grid-cols-2 sm:grid-cols-4 items-center gap-2 pt-3 border-t border-[var(--color-border)]">
                            <CopyButton target="title" text={t.copyTitle} />
                            <CopyButton target="style" text={t.copyStyle} />
                            <CopyButton target="lyrics" text={t.copyLyrics} />
                            <CopyButton target="all" text={t.copyAll} />
                        </div>
                    </div>
                    
                    <div className="flex-grow p-4 sm:p-6 space-y-2 overflow-y-auto custom-scrollbar">
                        <div className="space-y-1">
                           {metaData.map((line, lineIndex) => (
                               <FormattedLine key={`meta-${lineIndex}`} line={line} />
                           ))}
                        </div>

                       {sections.map((section, sectionIndex) => (
                           <div key={`section-${sectionIndex}`}>
                               {section.type !== 'lyrics-header' && section.content.length > 0 && <FormattedLine line={section.type} />}
                               {section.content.map((line, lineIndex) => (
                                   <FormattedLine key={`line-${sectionIndex}-${lineIndex}`} line={line} />
                               ))}
                           </div>
                       ))}
                       {processedWatermark && (
                           <div className="mt-8 pt-4 border-t border-[var(--color-border)]">
                               <p className="text-xs italic text-[var(--color-text-tertiary)]">{processedWatermark}</p>
                           </div>
                       )}
                   </div>
                </div>
                <Suspense fallback={null}>
                    <AlbumArtGeneratorModal 
                        isOpen={isArtModalOpen}
                        onClose={() => setIsArtModalOpen(false)}
                        onSubmit={handleGenerateArtRequest}
                        songData={songData}
                        inputs={inputs}
                        t={translations[language].ui}
                        language={language}
                    />
                </Suspense>
                </>
            );
        }
        return <InitialPlaceholder t={t} />;
    };

    return (
        <div className="w-full h-full main-panel flex flex-col justify-center">
          {renderContent()}
        </div>
    );
});