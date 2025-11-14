import React, { useState, useRef, useEffect } from 'react';
import { SpinnerIcon, CpuChipIcon, ZapIcon, SoundWave3DIcon, RefreshCwIcon, FlagThIcon, FlagEnIcon, FlagCnIcon, FlagJpIcon, FlagKrIcon } from './icons';
// Fix: Import Language type from translations.ts to avoid circular dependencies.
import { translations, type Language } from '../translations';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';

export interface FormState {
  prompt: string;
  coreTheme: string;
  story: string;
  keyEmotions: string;
  imagery: string;
  selectedGenre: string[];
  selectedMood: string[];
  selectedTempo: string[];
  selectedVocal: string;
  selectedInstruments: string[];
  inspiredBySong: string;
  inspiredByArtist: string;
  maleRole: string;
  femaleRole: string;
  songStructure: string[];
  sunoAiMode: 'auto' | 'manual';
  weirdness: number;
  styleInfluence: number;
  selectedModel: string;
  watermark: string;
}

export type ActiveTab = 'idea' | 'style' | 'advanced';

interface InputFormProps {
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  onRandomizeMainIdea: () => void;
  isRandomizingIdea: boolean;
  pendingIdeaRandomization: string | null;
  onApplyIdeaRandomization: () => void;
  onCancelIdeaRandomization: () => void;
  onRandomizeNarrative: () => void;
  isRandomizingNarrative: boolean;
  onRandomizeStructure: () => void;
  isRandomizingStructure: boolean;
  onRandomizeStyle: () => void;
  isRandomizingStyle: boolean;
  onAnalyzeArtistStyle: () => void;
  isAnalyzingArtistStyle: boolean;
  onRandomizeAll: () => void;
  isRandomizingAll: boolean;
  pendingRandomization: Partial<FormState> | null;
  onApplyRandomization: () => void;
  onCancelRandomization: () => void;
  onResetNarrative: () => void;
  onResetAll: () => void;
  onGenerateSong: () => void;
  isLoading: boolean;
  onLanguageChange: (lang: Language) => void;
  t: (typeof translations)[Language];
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

type StyleTemplate = (typeof translations)[Language]['options']['STYLE_TEMPLATES'][0];
type StructureTemplate = (typeof translations)[Language]['options']['SONG_STRUCTURE_TEMPLATES'][0];


// Generic Modal Hook for focus trapping and escape key handling
const useModalBehavior = (isOpen: boolean, onClose: () => void, modalRef: React.RefObject<HTMLDivElement>) => {
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const modalNode = modalRef.current;
        if (!modalNode) return;

        const focusableElements = modalNode.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);
};

interface StyleTemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (template: StyleTemplate) => void;
    t: (typeof translations)[Language]['ui'];
}

const StyleTemplatesModal: React.FC<StyleTemplatesModalProps> = ({ isOpen, onClose, onSelect, t }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    useModalBehavior(isOpen, onClose, modalRef);

    if (!isOpen) return null;

    const StyleTemplateCard: React.FC<{ template: StyleTemplate; onClick: () => void; }> = ({ template, onClick }) => (
        <button type="button" className="template-card" onClick={onClick}>
            <h4 className="font-bold text-base text-[var(--color-text-primary)] mb-1">{template.name}</h4>
            <p className="text-xs text-[var(--color-text-tertiary)]">
                {[...template.genres, ...template.moods, ...template.tempos].join(', ')}
            </p>
        </button>
    );

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="style-templates-modal-title">
            <div ref={modalRef} className="relative w-full max-w-3xl max-h-[80vh] bg-[var(--color-bg-light)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col animate-reveal" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-shrink-0">
                    <h2 id="style-templates-modal-title" className="text-xl font-semibold text-[var(--color-text-primary)]">
                        {t.styleTemplatesModalTitle}
                    </h2>
                    <button onClick={onClose} className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-full hover:bg-[var(--color-border)] transition-colors" aria-label={t.closeModal}>
                        <span className="font-bold text-lg leading-none">&times;</span>
                    </button>
                </header>
                <main className="flex-grow p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar">
                    {translations[useAppContext().language].options.STYLE_TEMPLATES.map(template => (
                        <StyleTemplateCard
                            key={template.name}
                            template={template}
                            onClick={() => onSelect(template)}
                        />
                    ))}
                </main>
            </div>
        </div>
    );
};

interface StructureTemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (template: StructureTemplate) => void;
    t: (typeof translations)[Language]['ui'];
}

const StructureTemplatesModal: React.FC<StructureTemplatesModalProps> = ({ isOpen, onClose, onSelect, t }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    useModalBehavior(isOpen, onClose, modalRef);

    if (!isOpen) return null;

    const StructureTemplateCard: React.FC<{ template: StructureTemplate; onClick: () => void; }> = ({ template, onClick }) => (
        <button type="button" className="template-card" onClick={onClick}>
            <h4 className="font-bold text-base text-[var(--color-text-primary)] mb-2">{template.name}</h4>
            <div className="structure-path">
                {template.structure.join(' → ')}
            </div>
        </button>
    );

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="structure-templates-modal-title">
            <div ref={modalRef} className="relative w-full max-w-3xl max-h-[80vh] bg-[var(--color-bg-light)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col animate-reveal" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-shrink-0">
                    <h2 id="structure-templates-modal-title" className="text-xl font-semibold text-[var(--color-text-primary)]">
                        {t.structureTemplatesModalTitle}
                    </h2>
                    <button onClick={onClose} className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-full hover:bg-[var(--color-border)] transition-colors" aria-label={t.closeModal}>
                        <span className="font-bold text-lg leading-none">&times;</span>
                    </button>
                </header>
                <main className="flex-grow p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar">
                    {translations[useAppContext().language].options.SONG_STRUCTURE_TEMPLATES.map(template => (
                        <StructureTemplateCard
                            key={template.name}
                            template={template}
                            onClick={() => onSelect(template)}
                        />
                    ))}
                </main>
            </div>
        </div>
    );
};


const MultiTagSelector: React.FC<{
    tags: string[];
    selectedTags: string[];
    onTagClick: (tag: string) => void;
    disabled: boolean;
}> = ({ tags, selectedTags, onTagClick, disabled }) => (
    <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
            <button key={tag} type="button" onClick={() => onTagClick(tag)} disabled={disabled}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedTags.includes(tag) 
                ? 'bg-fuchsia-600 text-white border-transparent shadow-md shadow-fuchsia-500/20' 
                : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)]'
                }`}
            >
                {tag}
            </button>
        ))}
    </div>
);

const CustomInput: React.FC<{
    onAdd: (tag: string) => void;
    placeholder: string;
    disabled: boolean;
    t: (typeof translations)[Language]['ui'];
}> = ({ onAdd, placeholder, disabled, t }) => {
    const [value, setValue] = useState('');
    
    const handleAdd = () => {
        if (value.trim()) {
            onAdd(value.trim());
            setValue('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <div className="flex items-center gap-2 mt-3">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="input-base text-sm flex-grow"
            />
            <button
                type="button"
                onClick={handleAdd}
                disabled={disabled || !value.trim()}
                className="btn btn-secondary flex-shrink-0 btn-spotlight"
            >
                {t.addStructureButton}
            </button>
        </div>
    );
};

const NarrativeInput: React.FC<{
    id: keyof FormState;
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    rows?: number;
}> = ({ id, label, placeholder, value, onChange, disabled, rows = 2 }) => (
    <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)] focus-within:border-[var(--color-primary-brand)] transition-colors h-full flex flex-col group">
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-text-secondary)] group-focus-within:text-[var(--color-primary-brand)] mb-2 transition-colors">
            {label}
        </label>
        <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none text-base custom-scrollbar flex-grow"
            rows={rows}
            disabled={disabled}
        />
    </div>
);
  
export const InputForm: React.FC<InputFormProps> = ({ 
    formState, setFormState, 
    onRandomizeMainIdea, isRandomizingIdea, onRandomizeNarrative, isRandomizingNarrative, onRandomizeStructure, isRandomizingStructure, onRandomizeStyle, isRandomizingStyle, onAnalyzeArtistStyle, isAnalyzingArtistStyle, onRandomizeAll, isRandomizingAll, onResetNarrative, onResetAll, onGenerateSong,
    isLoading, onLanguageChange, t, activeTab, setActiveTab,
    pendingRandomization, onApplyRandomization, onCancelRandomization,
    pendingIdeaRandomization, onApplyIdeaRandomization, onCancelIdeaRandomization
}) => {
    const { language } = useAppContext();
    const { showToast } = useToast();
    const { 
        prompt, coreTheme, story, keyEmotions, imagery, selectedGenre, selectedMood, selectedTempo,
        selectedVocal, sunoAiMode, weirdness, styleInfluence, selectedInstruments
    } = formState;

    const tu = t.ui;

    const [customStructurePart, setCustomStructurePart] = useState('');
    const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
    const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);

    const handleAddCustomPart = () => {
        let part = customStructurePart.trim();
        if (part) {
            if (!part.startsWith('[')) {
                part = `[${part}`;
            }
            if (!part.endsWith(']')) {
                part = `${part}]`;
            }
            setFormState(prev => ({ ...prev, songStructure: [...prev.songStructure, part] }));
            setCustomStructurePart('');
        }
    };

    const handleAddCustomPartKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddCustomPart();
        }
    };
    
    const handleSelectStructureTemplate = (template: StructureTemplate) => {
        setFormState(prev => ({
            ...prev,
            songStructure: [...template.structure],
        }));
        setIsStructureModalOpen(false);
        showToast(tu.structureSuggestionSuccess, 'success');
    };
    
    const handleSelectStyleTemplate = (template: StyleTemplate) => {
        setFormState(prev => ({
            ...prev,
            selectedGenre: [...template.genres],
            selectedMood: [...template.moods],
            selectedTempo: [...template.tempos],
        }));
        setIsStyleModalOpen(false);
        showToast(tu.styleAppliedSuccess, 'success');
    };

    const handleResetStyle = () => {
        setFormState(prev => ({
            ...prev,
            selectedGenre: [],
            selectedMood: [],
            selectedTempo: [],
        }));
    };
    
    const handleResetStructure = () => {
        setFormState(prev => ({
            ...prev,
            songStructure: [],
        }));
    };

    const createMultiTagToggleHandler = (
        key: 'selectedGenre' | 'selectedMood' | 'selectedTempo' | 'selectedInstruments'
    ) => (tag: string) => {
        setFormState(prev => {
            const currentTags = prev[key];
            let newTags;
            if (key === 'selectedTempo') {
                newTags = currentTags.includes(tag) ? [] : [tag];
            } else {
                newTags = currentTags.includes(tag) ? currentTags.filter(item => item !== tag) : [...currentTags, tag];
            }
            return { ...prev, [key]: newTags };
        });
    };
    
    const handleAddCustomTag = (
        key: 'selectedGenre' | 'selectedMood' | 'selectedTempo' | 'selectedInstruments',
        tag: string
    ) => {
        if (tag) {
            setFormState(prev => {
                const currentTags = prev[key];
                if (currentTags.includes(tag)) return prev;

                let newTags;
                if (key === 'selectedTempo') {
                    newTags = [tag];
                } else {
                    newTags = [...currentTags, tag];
                }
                return { ...prev, [key]: newTags };
            });
        }
    };

    const TabButton: React.FC<{ tabId: ActiveTab; label: string; }> = ({ tabId, label }) => (
        <button
            type="button"
            onClick={() => setActiveTab(tabId)}
            className={`flex-1 px-3 py-4 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tabId
                ? 'text-[var(--color-primary-brand)] border-[var(--color-primary-brand)]'
                : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[color:var(--color-bg-light)]'
            }`}
        >
            {label}
        </button>
    );

  const isAnalyzeDisabled = isLoading || isAnalyzingArtistStyle || !formState.inspiredByArtist.trim();
  const analyzeArtistTooltip = !formState.inspiredByArtist.trim() && !isLoading && !isAnalyzingArtistStyle
      ? tu.analyzeArtistDisabledTooltip
      : tu.analyzeArtistButtonTooltip;

  return (
    <>
    <div className="w-full h-full main-panel flex flex-col">
        <div className="flex-shrink-0 border-b border-[var(--color-border)]">
            <div className="flex items-center">
                <TabButton tabId="idea" label={tu.tabIdea} />
                <TabButton tabId="style" label={tu.tabStyle} />
                <TabButton tabId="advanced" label={tu.tabAdvanced} />
            </div>
        </div>
        
        <div className="flex-grow p-4 sm:p-6 space-y-8 custom-scrollbar overflow-y-auto">
            {activeTab === 'idea' && (
              <div className="space-y-8 animate-fade-in">
                <section className="space-y-4">
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">{tu.section1Title}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button type="button" onClick={onRandomizeAll} disabled={isLoading || isRandomizingAll || isRandomizingNarrative || isRandomizingIdea} className="btn btn-secondary btn-spotlight">
                            {isRandomizingAll ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : tu.randomizeAllButton}
                        </button>
                        <button type="button" onClick={onRandomizeMainIdea} disabled={isLoading || isRandomizingIdea || isRandomizingNarrative || isRandomizingAll} className="btn btn-secondary btn-spotlight">
                           {isRandomizingIdea ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : tu.randomizeIdeaButton}
                        </button>
                        <button type="button" onClick={onResetAll} disabled={isLoading} className="btn btn-secondary btn-spotlight">
                           {tu.resetAllButton}
                        </button>
                    </div>
                     {pendingRandomization && (
                        <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] flex flex-col animate-fade-in gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">{tu.randomizationPreviewTitle}</p>
                                <p className="text-sm text-[var(--color-text-primary)] mt-1 truncate" title={pendingRandomization.prompt}>
                                    <strong className="text-[var(--color-text-secondary)]">{tu.labelPrompt}:</strong> {pendingRandomization.prompt}
                                </p>
                                <p className="text-sm text-[var(--color-text-primary)] mt-1 truncate">
                                    <strong className="text-[var(--color-text-secondary)]">{tu.tabStyle}:</strong> {[...(pendingRandomization.selectedGenre || []), ...(pendingRandomization.selectedMood || []), ...(pendingRandomization.selectedTempo || [])].join(', ')}
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-2 flex-shrink-0">
                                <button type="button" onClick={onCancelRandomization} className="btn btn-secondary !text-xs !px-3 !py-1.5">{tu.cancelRandomizationButton}</button>
                                <button type="button" onClick={onApplyRandomization} className="btn btn-primary !text-xs !px-3 !py-1.5">{tu.applyRandomizationButton}</button>
                            </div>
                        </div>
                    )}
                    {pendingIdeaRandomization && (
                         <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] flex flex-col animate-fade-in gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">{tu.ideaSuggestionTitle}</p>
                                <p className="text-sm text-[var(--color-text-primary)] mt-1" title={pendingIdeaRandomization}>
                                    {pendingIdeaRandomization}
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-2 flex-shrink-0">
                                <button type="button" onClick={onCancelIdeaRandomization} className="btn btn-secondary !text-xs !px-3 !py-1.5">{tu.cancelIdeaButton}</button>
                                <button type="button" onClick={onApplyIdeaRandomization} className="btn btn-primary !text-xs !px-3 !py-1.5">{tu.applyIdeaButton}</button>
                            </div>
                        </div>
                    )}
                    <textarea
                        id="main-prompt"
                        value={prompt}
                        onChange={(e) => setFormState(prev => ({ ...prev, prompt: e.target.value }))}
                        placeholder={tu.placeholderPrompt}
                        className="input-base custom-scrollbar"
                        rows={4}
                        disabled={isLoading || isRandomizingIdea || isRandomizingAll || isRandomizingNarrative}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault();
                                onGenerateSong();
                            }
                        }}
                    />
                </section>

                <section className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                        <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
                            {tu.narrativeTitle}
                        </h2>
                        <button type="button" onClick={onResetNarrative} disabled={isLoading} className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50">
                            {tu.resetButton}
                        </button>
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)] -mt-2">{tu.narrativeSubtitle}</p>

                    <div className="grid grid-cols-1 gap-2">
                        <button type="button" onClick={onRandomizeNarrative} disabled={isLoading || isRandomizingNarrative || isRandomizingAll || isRandomizingIdea} className="btn btn-secondary w-full flex items-center justify-center gap-2">
                           {isRandomizingNarrative ? <SpinnerIcon className="w-4 h-4 animate-spin mr-2"/> : null}
                           {tu.randomizeNarrativeButton}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NarrativeInput id="coreTheme" label={tu.labelCoreTheme} placeholder={tu.placeholderCoreTheme} value={coreTheme} onChange={value => setFormState(prev => ({ ...prev, coreTheme: value }))} disabled={isLoading || isRandomizingAll || isRandomizingNarrative}/>
                        <NarrativeInput id="story" label={tu.labelStory} placeholder={tu.placeholderStory} value={story} onChange={value => setFormState(prev => ({ ...prev, story: value }))} disabled={isLoading || isRandomizingAll || isRandomizingNarrative}/>
                        <NarrativeInput id="keyEmotions" label={tu.labelKeyEmotions} placeholder={tu.placeholderKeyEmotions} value={keyEmotions} onChange={value => setFormState(prev => ({ ...prev, keyEmotions: value }))} disabled={isLoading || isRandomizingAll || isRandomizingNarrative}/>
                        <NarrativeInput id="imagery" label={tu.labelImagery} placeholder={tu.placeholderImagery} value={imagery} onChange={value => setFormState(prev => ({ ...prev, imagery: value }))} disabled={isLoading || isRandomizingAll || isRandomizingNarrative}/>
                    </div>
                </section>
              </div>
            )}
            
            {activeTab === 'style' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                    <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{tu.styleOptionsLabel}</h3>
                        <button type="button" onClick={handleResetStyle} disabled={isLoading} className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50">{tu.resetButton}</button>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setIsStyleModalOpen(true)}
                            disabled={isLoading}
                            className="btn btn-secondary w-full"
                            aria-label={tu.styleTemplateLabel}
                        >
                            {tu.styleTemplateDefault}
                        </button>
                        <button 
                            type="button" 
                            onClick={onRandomizeStyle} 
                            disabled={isLoading || isRandomizingStyle} 
                            className="btn btn-secondary w-full flex items-center justify-center gap-2"
                        >
                            {isRandomizingStyle ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : tu.suggestStyleButton}
                        </button>
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">{tu.labelGenre} <span className="text-sm font-normal text-[var(--color-text-secondary)]">({tu.multiSelect})</span></h3>
                    <MultiTagSelector tags={[...new Set([...t.options.GENRES, ...selectedGenre])]} selectedTags={selectedGenre} onTagClick={createMultiTagToggleHandler('selectedGenre')} disabled={isLoading} />
                    <CustomInput onAdd={(tag) => handleAddCustomTag('selectedGenre', tag)} placeholder={tu.placeholderCustomTag} disabled={isLoading} t={tu} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">{tu.labelMood} <span className="text-sm font-normal text-[var(--color-text-secondary)]">({tu.multiSelect})</span></h3>
                    <MultiTagSelector tags={[...new Set([...t.options.MOODS, ...selectedMood])]} selectedTags={selectedMood} onTagClick={createMultiTagToggleHandler('selectedMood')} disabled={isLoading} />
                    <CustomInput onAdd={(tag) => handleAddCustomTag('selectedMood', tag)} placeholder={tu.placeholderCustomTag} disabled={isLoading} t={tu} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">{tu.labelTempo} <span className="text-sm font-normal text-[var(--color-text-secondary)]">({tu.singleSelect})</span></h3>
                    <MultiTagSelector tags={[...new Set([...t.options.TEMPOS, ...selectedTempo])]} selectedTags={selectedTempo} onTagClick={createMultiTagToggleHandler('selectedTempo')} disabled={isLoading} />
                    <CustomInput onAdd={(tag) => handleAddCustomTag('selectedTempo', tag)} placeholder={tu.placeholderCustomTag} disabled={isLoading} t={tu} />
                </div>
                 <div>
                    <label htmlFor="vocal-select" className="block text-lg font-semibold text-[var(--color-text-primary)] mb-3">{tu.labelVocal}</label>
                     <div className="relative">
                        <select id="vocal-select" value={selectedVocal} onChange={(e) => setFormState(prev => ({ ...prev, selectedVocal: e.target.value }))} disabled={isLoading}
                            className="input-base"
                        >
                            {t.options.VOCALS.map(vocal => <option key={vocal} value={vocal}>{vocal}</option>)}
                        </select>
                    </div>
                    {selectedVocal === t.options.VOCALS[2] && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-fade-in">
                            <input type="text" value={formState.maleRole} onChange={e => setFormState(prev => ({...prev, maleRole: e.target.value}))} placeholder={tu.placeholderMaleRole} disabled={isLoading} className="input-base"/>
                            <input type="text" value={formState.femaleRole} onChange={e => setFormState(prev => ({...prev, femaleRole: e.target.value}))} placeholder={tu.placeholderFemaleRole} disabled={isLoading} className="input-base"/>
                        </div>
                    )}
                </div>
                 <div>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">{tu.labelInstruments} <span className="text-sm font-normal text-[var(--color-text-secondary)]">({tu.multiSelect})</span></h3>
                    <MultiTagSelector tags={[...new Set([...t.options.INSTRUMENTS, ...selectedInstruments])]} selectedTags={formState.selectedInstruments} onTagClick={createMultiTagToggleHandler('selectedInstruments')} disabled={isLoading} />
                    <CustomInput onAdd={(tag) => handleAddCustomTag('selectedInstruments', tag)} placeholder={tu.placeholderCustomTag} disabled={isLoading} t={tu} />
                </div>
                <div>
                    <label className="block text-lg font-semibold text-[var(--color-text-primary)] mb-2">{tu.labelSunoSettings}</label>
                    <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Mode</span>
                            <div className="flex items-center gap-2 p-1 bg-[var(--color-bg-light)] rounded-full">
                                <button type="button" onClick={() => setFormState(prev => ({ ...prev, sunoAiMode: 'auto' }))} className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${sunoAiMode === 'auto' ? 'bg-fuchsia-600 text-white' : 'text-[var(--color-text-secondary)]'}`}> {tu.sunoAuto} </button>
                                <button type="button" onClick={() => setFormState(prev => ({ ...prev, sunoAiMode: 'manual' }))} className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${sunoAiMode === 'manual' ? 'bg-fuchsia-600 text-white' : 'text-[var(--color-text-secondary)]'}`}> {tu.sunoManual} </button>
                            </div>
                        </div>
                        {sunoAiMode === 'manual' && (
                            <div className="mt-4 space-y-4 animate-fade-in">
                                <div>
                                    <div className="flex justify-between items-center text-sm text-[var(--color-text-secondary)] mb-1">
                                        <div className="group relative">
                                            <label htmlFor="weirdness" className="cursor-help border-b border-dotted border-[var(--color-text-tertiary)]">{tu.labelWeirdness}</label>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-[var(--color-bg)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
                                                {tu.weirdnessTooltip}
                                            </div>
                                        </div>
                                        <span className="font-mono text-[var(--color-primary-brand)]">{weirdness}</span>
                                    </div>
                                    <input id="weirdness" type="range" min="0" max="100" value={weirdness} onChange={e => setFormState(prev => ({ ...prev, weirdness: parseInt(e.target.value, 10) }))} disabled={isLoading} className="w-full h-2 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary-brand)]"/>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center text-sm text-[var(--color-text-secondary)] mb-1">
                                        <div className="group relative">
                                            <label htmlFor="style-influence" className="cursor-help border-b border-dotted border-[var(--color-text-tertiary)]">{tu.labelStyleInfluence}</label>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-[var(--color-bg)] text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
                                                {tu.styleInfluenceTooltip}
                                            </div>
                                        </div>
                                        <span className="font-mono text-[var(--color-primary-brand)]">{styleInfluence}</span>
                                    </div>
                                    <input id="style-influence" type="range" min="0" max="100" value={styleInfluence} onChange={e => setFormState(prev => ({ ...prev, styleInfluence: parseInt(e.target.value, 10) }))} disabled={isLoading} className="w-full h-2 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary-brand)]"/>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                    <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{tu.labelStructure}</h3>
                        <button type="button" onClick={handleResetStructure} disabled={isLoading || isRandomizingStructure} className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50">{tu.resetButton}</button>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                        <button
                            type="button"
                            onClick={() => setIsStructureModalOpen(true)}
                            disabled={isLoading}
                            className="btn btn-secondary w-full"
                            aria-label={tu.structureTemplateLabel}
                        >
                            {tu.structureTemplateDefault}
                        </button>
                        <button type="button" onClick={onRandomizeStructure} disabled={isLoading || isRandomizingStructure} className="btn btn-secondary w-full flex items-center justify-center gap-2">
                            {isRandomizingStructure ? <SpinnerIcon className="w-4 h-4 animate-spin mr-2"/> : null}
                            {tu.suggestStructureButton}
                        </button>
                    </div>
                    <div className="p-3 bg-[var(--color-bg)] rounded-lg min-h-[44px] flex flex-wrap gap-2 border border-[var(--color-border)]">
                        {formState.songStructure.length > 0 ? formState.songStructure.map((part, index) => (
                            <div key={index} title={tu.structureRemoveTooltip} onClick={() => setFormState(prev => ({...prev, songStructure: prev.songStructure.filter((_, i) => i !== index)}))}
                                className="bg-cyan-900/50 text-cyan-300 text-sm font-medium px-3 py-1 rounded-md cursor-pointer hover:bg-cyan-800/50 transition-colors">
                                {part}
                            </div>
                        )) : <p className="text-sm text-[var(--color-text-tertiary)]">{tu.structurePlaceholder}</p>}
                    </div>
                     <div className="flex flex-wrap gap-2 mt-3">
                        {t.options.SONG_STRUCTURE_PARTS.map(part => (
                            <button key={part} type="button" onClick={() => setFormState(prev => ({...prev, songStructure: [...prev.songStructure, part]}))} disabled={isLoading}
                                className="px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 border bg-[var(--color-bg-light)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:border-[var(--color-border-hover)] disabled:opacity-50">
                                + {part}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        <input
                            type="text"
                            value={customStructurePart}
                            onChange={(e) => setCustomStructurePart(e.target.value)}
                            onKeyDown={handleAddCustomPartKeyDown}
                            placeholder={tu.placeholderCustomStructure}
                            className="input-base text-sm flex-grow"
                            disabled={isLoading}
                        />
                        <button
                            type="button"
                            onClick={handleAddCustomPart}
                            disabled={isLoading || !customStructurePart.trim()}
                            className="btn btn-secondary flex-shrink-0 btn-spotlight"
                        >
                            {tu.addStructureButton}
                        </button>
                    </div>
                </div>
                 <div>
                    <label className="block text-lg font-semibold text-[var(--color-text-primary)] mb-2">Inspiration <span className="text-[var(--color-text-tertiary)] text-sm font-normal">({tu.optional})</span></label>
                    <div className="grid grid-cols-1 gap-4">
                        <input type="text" value={formState.inspiredBySong} onChange={e => setFormState(prev => ({...prev, inspiredBySong: e.target.value}))} placeholder={tu.placeholderInspirationSong} disabled={isLoading} className="input-base"/>
                        <div className="flex items-center gap-2">
                            <input 
                                type="text" 
                                value={formState.inspiredByArtist} 
                                onChange={e => setFormState(prev => ({...prev, inspiredByArtist: e.target.value}))} 
                                placeholder={tu.placeholderInspirationArtist} 
                                disabled={isLoading || isAnalyzingArtistStyle} 
                                className="input-base flex-grow"
                            />
                            <button
                                type="button"
                                onClick={onAnalyzeArtistStyle}
                                disabled={isAnalyzeDisabled}
                                className="btn btn-secondary flex-shrink-0 btn-spotlight"
                                title={analyzeArtistTooltip}
                            >
                                {isAnalyzingArtistStyle ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <span>{tu.analyzeArtistButton}</span>}
                            </button>
                        </div>
                    </div>
                </div>
                
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{tu.sectionTitleAppSettings}</h3>
                     <p className="text-sm text-[var(--color-text-tertiary)] -mt-2">{tu.appSettingsSubtitle}</p>
                    <div>
                        <label htmlFor="language-select" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">{tu.labelLanguage}</label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {(Object.keys(translations) as Language[]).map(lang => {
                                const FlagIcon = {
                                    th: FlagThIcon,
                                    en: FlagEnIcon,
                                    zh: FlagCnIcon,
                                    ja: FlagJpIcon,
                                    ko: FlagKrIcon
                                }[lang];

                                return (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => onLanguageChange(lang)}
                                    className={`btn btn-toggle btn-language ${language === lang ? 'active' : ''}`}
                                >
                                    <FlagIcon className="w-6 h-auto rounded-sm flag-icon-3d"/>
                                    <span>{translations[lang].languageName}</span>
                                </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="model-select" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">{tu.labelModel}</label>
                         <div className="flex items-center gap-2 p-1 bg-[var(--color-bg)] rounded-full border border-[var(--color-border)]">
                            <button type="button" onClick={() => setFormState(prev => ({ ...prev, selectedModel: 'gemini-2.5-pro' }))} className={`flex-1 btn btn-toggle !rounded-full !py-2 ${formState.selectedModel === 'gemini-2.5-pro' ? 'active' : ''}`} title={tu.modelProTooltip}>
                                <CpuChipIcon className="w-4 h-4" />
                                {tu.modelPro}
                            </button>
                            <button type="button" onClick={() => setFormState(prev => ({ ...prev, selectedModel: 'gemini-2.5-flash' }))} className={`flex-1 btn btn-toggle !rounded-full !py-2 ${formState.selectedModel === 'gemini-2.5-flash' ? 'active' : ''}`} title={tu.modelFlashTooltip}>
                                <ZapIcon className="w-4 h-4"/>
                                {tu.modelFlash}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="watermark" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">{tu.labelWatermark}</label>
                        <input id="watermark" type="text" value={formState.watermark} onChange={e => setFormState(prev => ({...prev, watermark: e.target.value}))} placeholder={tu.placeholderWatermark} disabled={isLoading} className="input-base"/>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{tu.watermarkPlaceholderHelp}</p>
                    </div>
                </div>
              </div>
            )}
        </div>
        
        <footer className="flex-shrink-0 p-4 border-t border-[var(--color-border)] bg-[var(--color-panel)] rounded-b-xl">
             <p className="text-xs text-[var(--color-text-tertiary)] text-center mb-4">{tu.submitShortcut}</p>
             <button onClick={onGenerateSong} disabled={isLoading || isRandomizingAll || isRandomizingNarrative || isRandomizingIdea} className={`btn btn-primary w-full !text-lg !py-4 btn-spotlight ${isLoading ? 'is-loading' : ''}`}>
                {isLoading && <SpinnerIcon className="w-6 h-6 animate-spin"/>}
                <span className={isLoading ? "ml-3" : ""}>{isLoading ? tu.submitButtonLoading : tu.submitButton}</span>
            </button>
        </footer>
    </div>
    <StyleTemplatesModal
        isOpen={isStyleModalOpen}
        onClose={() => setIsStyleModalOpen(false)}
        onSelect={handleSelectStyleTemplate}
        t={tu}
    />
    <StructureTemplatesModal
        isOpen={isStructureModalOpen}
        onClose={() => setIsStructureModalOpen(false)}
        onSelect={handleSelectStructureTemplate}
        t={tu}
    />
    </>
  );
};