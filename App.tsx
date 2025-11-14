import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { InputForm, FormState, ActiveTab } from './components/InputForm';
import { SongDisplay } from './components/SongDisplay';
import { generateSong, type GenerateSongParams, generateRandomIdea, generateRandomNarrative, generateNarrativeFromIdea, generateSongStructure, generateStyleFromIdea, generateStyleFromArtist, RateLimitError } from './geminiService';
import { HeadphonesIcon, SunIcon, MoonIcon } from './components/icons';
import { translations, type Language } from './translations';
import type { HistoryItem } from './components/HistoryModal';
import { useAppContext } from './contexts/AppContext';
import { useToast } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import WelcomeModal from './components/WelcomeModal';

const HistoryModal = lazy(() => import('./components/HistoryModal').then(module => ({ default: module.HistoryModal })));
const SupportModal = lazy(() => import('./components/SupportModal').then(module => ({ default: module.SupportModal })));


const initialFormState: FormState = {
    prompt: '',
    coreTheme: '',
    story: '',
    keyEmotions: '',
    imagery: '',
    selectedGenre: [],
    selectedMood: [],
    selectedTempo: [],
    selectedVocal: translations['th'].options.VOCALS[0],
    selectedInstruments: [],
    inspiredBySong: '',
    inspiredByArtist: '',
    maleRole: '',
    femaleRole: '',
    songStructure: [],
    sunoAiMode: 'auto',
    weirdness: 0,
    styleInfluence: 100,
    selectedModel: 'gemini-2.5-pro',
    watermark: '',
};

const HISTORY_KEY = 'suno-composer-history';
const MAX_HISTORY_ITEMS = 30;

const ConfirmationDialog: React.FC<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    t: (typeof translations)[Language]['ui'];
}> = ({ title, message, onConfirm, onCancel, t }) => (
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" className="modal-overlay animate-fade-in">
        <div className="confirm-dialog">
            <h3 id="confirm-title" className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h3>
            <p id="confirm-desc" className="text-sm text-[var(--color-text-secondary)] mt-2 mb-6">{message}</p>
            <div className="flex justify-end gap-3">
                <button onClick={onCancel} className="btn btn-secondary">{t.cancelButton}</button>
                <button onClick={onConfirm} className="btn btn-danger">{t.confirmButton}</button>
            </div>
        </div>
    </div>
);

const RateLimitModal: React.FC<{
    message: string;
    onClose: () => void;
    t: (typeof translations)[Language]['ui'];
}> = ({ message, onClose, t }) => (
    <div role="alertdialog" aria-modal="true" aria-labelledby="rate-limit-title" className="modal-overlay animate-fade-in">
        <div className="confirm-dialog">
            <h3 id="rate-limit-title" className="text-lg font-bold text-warning">{t.errorRateLimitTitle}</h3>
            <div className="text-sm text-[var(--color-text-secondary)] mt-2 mb-6" dangerouslySetInnerHTML={{ __html: message }}/>
            <div className="flex justify-end gap-3">
                <button onClick={onClose} className="btn btn-primary">{t.closeModal}</button>
            </div>
        </div>
    </div>
);


const App: React.FC = () => {
  const { 
    language, 
    handleLanguageChange: setLanguage,
    isSupportModalOpen,
    handleCloseSupportModal,
    rateLimitError,
    setRateLimitError,
    theme,
    toggleTheme,
  } = useAppContext();
  
  const { showToast } = useToast();
  
  const [activeTab, setActiveTab] = useState<ActiveTab>('idea');
  
  const t = useMemo(() => translations[language], [language]);

  const [formState, setFormState] = useState<FormState>({
    ...initialFormState,
    selectedVocal: t.options.VOCALS[0],
  });

  const [songData, setSongData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRandomizingIdea, setIsRandomizingIdea] = useState<boolean>(false);
  const [pendingIdeaRandomization, setPendingIdeaRandomization] = useState<string | null>(null);
  const [isRandomizingNarrative, setIsRandomizingNarrative] = useState<boolean>(false);
  const [isRandomizingStructure, setIsRandomizingStructure] = useState<boolean>(false);
  const [isRandomizingStyle, setIsRandomizingStyle] = useState<boolean>(false);
  const [isAnalyzingArtistStyle, setIsAnalyzingArtistStyle] = useState<boolean>(false);
  const [isRandomizingAll, setIsRandomizingAll] = useState<boolean>(false);
  const [pendingRandomization, setPendingRandomization] = useState<Partial<FormState> | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [currentSongInputs, setCurrentSongInputs] = useState<FormState | null>(null);
  
  // Load form state and history on initial render
  useEffect(() => {
    const initialize = () => {
        try {
            const savedStateJSON = localStorage.getItem('suno-composer-form-state');
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);
                
                if (!savedState.selectedModel) {
                    savedState.selectedModel = 'gemini-2.5-pro';
                }
                
                const currentLangOptions = translations[language].options;

                if (savedState.selectedVocal && !currentLangOptions.VOCALS.includes(savedState.selectedVocal)) {
                    savedState.selectedVocal = currentLangOptions.VOCALS[0];
                }
                if (savedState.selectedGenre) {
                    savedState.selectedGenre = savedState.selectedGenre.filter((g: string) => [...currentLangOptions.GENRES, ...savedState.selectedGenre].includes(g));
                }
                 if (savedState.selectedMood) {
                    savedState.selectedMood = savedState.selectedMood.filter((m: string) => [...currentLangOptions.MOODS, ...savedState.selectedMood].includes(m));
                }
                if (savedState.selectedTempo) {
                    savedState.selectedTempo = savedState.selectedTempo.filter((t: string) => [...currentLangOptions.TEMPOS, ...savedState.selectedTempo].includes(t));
                }
                if (savedState.selectedInstruments) {
                    savedState.selectedInstruments = savedState.selectedInstruments.filter((i: string) => [...currentLangOptions.INSTRUMENTS, ...savedState.selectedInstruments].includes(i));
                }

                setFormState(prevState => ({ ...prevState, ...savedState }));
            }
            
            const savedHistoryJSON = localStorage.getItem(HISTORY_KEY);
            if (savedHistoryJSON) {
                setHistory(JSON.parse(savedHistoryJSON));
            }
        } catch (error) {
            console.error('Could not load state from localStorage:', error);
            localStorage.removeItem('suno-composer-form-state');
            localStorage.removeItem(HISTORY_KEY);
        }
    };
    initialize();
  }, [language]);


  // Debounced saving of form state to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('suno-composer-form-state', JSON.stringify(formState));
      } catch (error) {
        console.error('Could not save form state to localStorage:', error);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [formState]);

  // Accessibility: Hide main content when modal is open
  useEffect(() => {
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        if (isHistoryModalOpen || isResetConfirmOpen) {
            mainContainer.setAttribute('aria-hidden', 'true');
        } else {
            mainContainer.removeAttribute('aria-hidden');
        }
    }
  }, [isHistoryModalOpen, isResetConfirmOpen]);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isModalOpen = isHistoryModalOpen || isResetConfirmOpen || !!rateLimitError;
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [isHistoryModalOpen, isResetConfirmOpen, rateLimitError]);


  // History management
  const addToHistory = (songData: string, inputs: FormState) => {
    const titleMatch = songData.match(new RegExp(`^${t.prompts.label_song_title.slice(0, -1)}:\\s*(.*)`, 'm'));
    const styleMatch = songData.match(new RegExp(`^${t.prompts.label_style.slice(0, -1)}:\\s*(.*)`, 'm'));

    const newHistoryItem: HistoryItem = {
      id: Date.now(),
      songData,
      inputs,
      title: titleMatch ? titleMatch[1].trim() : 'Untitled',
      style: styleMatch ? styleMatch[1].trim() : 'Unknown Style',
      createdAt: new Date().toISOString(),
    };

    setHistory(prevHistory => {
        const updatedHistory = [newHistoryItem, ...prevHistory].slice(0, MAX_HISTORY_ITEMS);
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        } catch (error) {
            console.error("Could not save history to localStorage:", error);
        }
        return updatedHistory;
    });
  };

  const deleteHistoryItem = (id: number) => {
    setHistory(prevHistory => {
        const updatedHistory = prevHistory.filter(item => item.id !== id);
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        } catch (error) {
            console.error("Could not save history to localStorage:", error);
        }
        return updatedHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
        console.error("Could not remove history from localStorage:", error);
    }
  };

  const restoreFromHistory = (item: HistoryItem) => {
    setFormState(item.inputs);
    setSongData(item.songData);
    setCurrentSongInputs(item.inputs); // also update current song inputs
    setIsHistoryModalOpen(false);
  };


  const handleFormChange = useCallback((newState: Partial<FormState>) => {
    setFormState(prevState => ({ ...prevState, ...newState }));
  }, []);

  const handleGenerateSong = useCallback(async () => {
    const hasMainIdea = formState.prompt.trim() !== '';
    const hasNarrative = [formState.coreTheme, formState.story, formState.keyEmotions, formState.imagery].some(field => field.trim() !== '');

    if (!hasMainIdea && !hasNarrative) {
      showToast(t.ui.errorPrompt, 'error');
      return;
    }
    
    setIsLoading(true);
    setSongData(null);
    setCurrentSongInputs(null);

    const userPrompt = [
        `Main Idea: ${formState.prompt || 'Not provided'}.`,
        `Core Theme: ${formState.coreTheme || 'Not provided'}.`,
        `Story: ${formState.story || 'Not provided'}.`,
        `Key Emotions: ${formState.keyEmotions || 'Not provided'}.`,
        `Imagery: ${formState.imagery || 'Not provided'}.`
    ].join('\n');


    try {
      const result = await generateSong({
        userPrompt,
        genres: formState.selectedGenre,
        moods: formState.selectedMood,
        tempos: formState.selectedTempo,
        vocalGender: formState.selectedVocal,
        instruments: formState.selectedInstruments,
        inspiredBySong: formState.inspiredBySong,
        inspiredByArtist: formState.inspiredByArtist,
        maleRole: formState.maleRole,
        femaleRole: formState.femaleRole,
        songStructure: formState.songStructure,
        sunoAiMode: formState.sunoAiMode,
        weirdness: formState.weirdness,
        styleInfluence: formState.styleInfluence,
        model: formState.selectedModel,
        language,
      });
      setSongData(result);
      setCurrentSongInputs(formState);
      addToHistory(result, formState);

    } catch (error) {
      console.error("Song generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
      if (error instanceof RateLimitError) {
        setRateLimitError(errorMessage);
      } else {
        showToast(errorMessage, 'error');
      }
      setSongData(null);
    } finally {
      setIsLoading(false);
    }
  }, [formState, language, showToast, t, setRateLimitError]);

  const handleRandomizeMainIdea = async () => {
    setIsRandomizingIdea(true);
    setPendingIdeaRandomization(null);
    try {
        const idea = await generateRandomIdea(language);
        setPendingIdeaRandomization(idea);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
         if (error instanceof RateLimitError) {
            setRateLimitError(errorMessage);
        } else {
            showToast(errorMessage, 'error');
        }
    } finally {
        setIsRandomizingIdea(false);
    }
  };

  const applyIdeaRandomization = () => {
      if (pendingIdeaRandomization) {
          setFormState(prev => ({...prev, prompt: pendingIdeaRandomization}));
          setPendingIdeaRandomization(null);
          showToast(t.ui.ideaAppliedSuccess, 'success');
      }
  };
  const cancelIdeaRandomization = () => setPendingIdeaRandomization(null);

  const handleRandomizeNarrative = async () => {
      setIsRandomizingNarrative(true);
      try {
          let narrative;
          if (formState.prompt.trim()) {
              narrative = await generateNarrativeFromIdea(language, formState.prompt);
          } else {
              narrative = await generateRandomNarrative(language);
          }
          setFormState(prev => ({...prev, ...narrative}));
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
          if (error instanceof RateLimitError) {
            setRateLimitError(errorMessage);
          } else {
            showToast(errorMessage, 'error');
          }
      } finally {
          setIsRandomizingNarrative(false);
      }
  };

  const handleRandomizeStructure = async () => {
      const hasMainIdea = formState.prompt.trim() !== '';
      const hasStyle = formState.selectedGenre.length > 0 || formState.selectedMood.length > 0;
      if (!hasMainIdea && !hasStyle) {
          showToast(t.ui.structureSuggestionError, 'error');
          return;
      }
      setIsRandomizingStructure(true);
      try {
          const structure = await generateSongStructure(formState, language);
          setFormState(prev => ({...prev, songStructure: structure}));
          showToast(t.ui.structureSuggestionSuccess, 'success');
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
          if (error instanceof RateLimitError) {
            setRateLimitError(errorMessage);
          } else {
            showToast(errorMessage, 'error');
          }
      } finally {
          setIsRandomizingStructure(false);
      }
  };

  const handleRandomizeStyle = async () => {
      if (!formState.prompt.trim() && !formState.coreTheme.trim()) {
          showToast(t.ui.styleSuggestionError, 'error');
          return;
      }
      setIsRandomizingStyle(true);
      try {
          const style = await generateStyleFromIdea(formState, language);
          setFormState(prev => ({
              ...prev, 
              selectedGenre: style.genres, 
              selectedMood: style.moods, 
              selectedTempo: style.tempos,
              selectedInstruments: style.instruments,
          }));
          showToast(t.ui.styleSuggestionSuccess, 'success');
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
          if (error instanceof RateLimitError) {
            setRateLimitError(errorMessage);
          } else {
            showToast(errorMessage, 'error');
          }
      } finally {
          setIsRandomizingStyle(false);
      }
  };

  const handleAnalyzeArtistStyle = async () => {
    if (!formState.inspiredByArtist.trim()) {
        showToast(t.ui.analyzeArtistError, 'error');
        return;
    }
    setIsAnalyzingArtistStyle(true);
    try {
        const styleSuggestion = await generateStyleFromArtist(formState.inspiredByArtist, language);
        
        setFormState(prevState => ({
            ...prevState,
            // Add new tags, avoiding duplicates, but keep existing user tags
            selectedGenre: [...new Set([...prevState.selectedGenre, ...styleSuggestion.genres])],
            selectedMood: [...new Set([...prevState.selectedMood, ...styleSuggestion.moods])],
            selectedInstruments: [...new Set([...prevState.selectedInstruments, ...styleSuggestion.instruments])],
            // Tempo is single-select, so replace it with the first (and only) suggestion
            selectedTempo: styleSuggestion.tempos.length > 0 ? [styleSuggestion.tempos[0]] : prevState.selectedTempo,
        }));

        showToast(t.ui.analyzeArtistSuccess, 'success');
        setActiveTab('style'); // Switch to style tab to show the changes
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
        if (error instanceof RateLimitError) {
            setRateLimitError(errorMessage);
        } else {
            showToast(errorMessage, 'error');
        }
    } finally {
        setIsAnalyzingArtistStyle(false);
    }
  };


  const handleRandomizeAll = async () => {
    setIsRandomizingAll(true);
    setPendingRandomization(null);
    try {
      const idea = await generateRandomIdea(language);
      // Temporarily set the new idea to get relevant style suggestions
      const tempFormStateForStyle = { ...formState, prompt: idea };
      const style = await generateStyleFromIdea(tempFormStateForStyle, language);
      
      setPendingRandomization({
          prompt: idea,
          selectedGenre: style.genres,
          selectedMood: style.moods,
          selectedTempo: style.tempos,
          selectedInstruments: style.instruments,
      });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t.ui.errorUnknown;
        if (error instanceof RateLimitError) {
            setRateLimitError(errorMessage);
        } else {
            showToast(errorMessage, 'error');
        }
    } finally {
        setIsRandomizingAll(false);
    }
  };

  const applyRandomization = () => {
    if (pendingRandomization) {
        setFormState(prev => ({ ...prev, ...pendingRandomization }));
        setPendingRandomization(null);
        showToast(t.ui.randomizationAppliedSuccess, 'success');
    }
  };
  const cancelRandomization = () => setPendingRandomization(null);

  const resetNarrative = () => {
      setFormState(prev => ({
          ...prev,
          coreTheme: '',
          story: '',
          keyEmotions: '',
          imagery: '',
      }));
  };

  const handleResetAll = () => {
      setFormState({
        ...initialFormState,
        selectedVocal: t.options.VOCALS[0], // Keep language-specific default
        selectedModel: formState.selectedModel, // Keep user's model choice
        watermark: formState.watermark, // Keep user's watermark
      });
      setSongData(null);
      setCurrentSongInputs(null);
      setIsResetConfirmOpen(false);
  };
  
  const handleRemix = () => {
    if (currentSongInputs) {
        setFormState(currentSongInputs);
    }
  };

  return (
    <>
      <main id="main-container" className="h-screen w-full flex flex-col p-2 sm:p-4 text-[var(--color-text-primary)]">
          <header className="flex-shrink-0 flex justify-between items-center mb-4 px-2">
            <div className="flex items-center gap-3">
              <div className="main-logo" onClick={handleRemix} title={t.ui.remixButton}>
                  <HeadphonesIcon/>
              </div>
              <div>
                  <h1 className="text-xl sm:text-2xl font-bold app-title-glow tracking-tight">{t.ui.appTitle}</h1>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] -mt-1">{t.ui.appSubtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
               <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-[var(--color-border)] transition-colors" aria-label={t.ui.toggleThemeButton}>
                {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
              </button>
              <button onClick={() => setIsHistoryModalOpen(true)} className="btn btn-secondary !px-3 !py-2">
                {t.ui.historyButton}
              </button>
            </div>
          </header>

          <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0">
              <InputForm
                  formState={formState}
                  setFormState={setFormState}
                  onRandomizeMainIdea={handleRandomizeMainIdea}
                  isRandomizingIdea={isRandomizingIdea}
                  pendingIdeaRandomization={pendingIdeaRandomization}
                  onApplyIdeaRandomization={applyIdeaRandomization}
                  onCancelIdeaRandomization={cancelIdeaRandomization}
                  onRandomizeNarrative={handleRandomizeNarrative}
                  isRandomizingNarrative={isRandomizingNarrative}
                  onRandomizeStructure={handleRandomizeStructure}
                  isRandomizingStructure={isRandomizingStructure}
                  onRandomizeStyle={handleRandomizeStyle}
                  isRandomizingStyle={isRandomizingStyle}
                  onAnalyzeArtistStyle={handleAnalyzeArtistStyle}
                  isAnalyzingArtistStyle={isAnalyzingArtistStyle}
                  onRandomizeAll={handleRandomizeAll}
                  isRandomizingAll={isRandomizingAll}
                  pendingRandomization={pendingRandomization}
                  onApplyRandomization={applyRandomization}
                  onCancelRandomization={cancelRandomization}
                  onResetNarrative={resetNarrative}
                  onResetAll={() => setIsResetConfirmOpen(true)}
                  onGenerateSong={handleGenerateSong}
                  isLoading={isLoading}
                  onLanguageChange={setLanguage}
                  t={t}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
              />
              <SongDisplay 
                songData={songData} 
                isLoading={isLoading} 
                watermark={formState.watermark} 
                songStructure={formState.songStructure}
                onRemix={handleRemix}
                inputs={currentSongInputs}
              />
          </div>
      </main>
      <Suspense fallback={null}>
        {isHistoryModalOpen && (
          <HistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            history={history}
            onRestore={restoreFromHistory}
            onDelete={deleteHistoryItem}
            onClearAll={clearHistory}
            t={t.ui}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
          {isSupportModalOpen && (
              <SupportModal
                  isOpen={isSupportModalOpen}
                  onClose={handleCloseSupportModal}
              />
          )}
      </Suspense>
      <ToastContainer />
      <WelcomeModal />
      {isResetConfirmOpen && (
        <ConfirmationDialog
            title={t.ui.confirmResetAllTitle}
            message={t.ui.confirmResetAllMessage}
            onConfirm={handleResetAll}
            onCancel={() => setIsResetConfirmOpen(false)}
            t={t.ui}
        />
      )}
       {rateLimitError && (
          <RateLimitModal
              message={rateLimitError}
              onClose={() => setRateLimitError(null)}
              t={t.ui}
          />
      )}
    </>
  );
};

export default App;