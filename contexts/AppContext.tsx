import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { type Language } from '../translations';

const LANGUAGE_KEY = 'suno-composer-language';
const THEME_KEY = 'suno-composer-theme';
const WELCOME_KEY = 'suno-composer-welcome-seen';

type Theme = 'light' | 'dark';

interface AppContextType {
    language: Language;
    handleLanguageChange: (lang: Language) => void;
    theme: Theme;
    toggleTheme: () => void;

    isWelcomeModalOpen: boolean;
    handleCloseWelcomeModal: () => void;
    
    // Kept for potential future use, but not triggered in the new flow
    isSupportModalOpen: boolean;
    handleCloseSupportModal: () => void;
    
    rateLimitError: string | null;
    setRateLimitError: (error: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('th');
    const [theme, setTheme] = useState<Theme>('dark');
    const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false); // Retained but unused in new flow
    const [rateLimitError, setRateLimitError] = useState<string | null>(null);

    useEffect(() => {
        try {
            // Language
            const storedLanguage = localStorage.getItem(LANGUAGE_KEY) as Language;
            if (storedLanguage) {
                setLanguage(storedLanguage);
            }
            
            // Theme
            const storedTheme = localStorage.getItem(THEME_KEY) as Theme;
            if (storedTheme) {
                setTheme(storedTheme);
            }
            
            // Welcome Modal
            const welcomeSeen = localStorage.getItem(WELCOME_KEY);
            if (!welcomeSeen) {
                setIsWelcomeModalOpen(true);
            }
        } catch (error) {
            console.error("Could not access localStorage:", error);
            // Show welcome modal if localStorage fails, as we can't check the flag
            setIsWelcomeModalOpen(true);
        }
    }, []);

    useEffect(() => {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${theme}-theme`);
    }, [theme]);

    const handleLanguageChange = (lang: Language) => {
        try {
            localStorage.setItem(LANGUAGE_KEY, lang);
        } catch (error) {
            console.error("Could not save language to localStorage:", error);
        }
        setLanguage(lang);
    };

    const toggleTheme = () => {
        setTheme(prevTheme => {
            const newTheme = prevTheme === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(THEME_KEY, newTheme);
            } catch (error) {
                console.error("Could not save theme to localStorage:", error);
            }
            return newTheme;
        });
    };

    const handleCloseWelcomeModal = () => {
        setIsWelcomeModalOpen(false);
        try {
            localStorage.setItem(WELCOME_KEY, 'true');
        } catch (error) {
            console.error("Could not save welcome status to localStorage:", error);
        }
    };
    
    const handleCloseSupportModal = () => {
        setIsSupportModalOpen(false);
    };

    const value: AppContextType = {
        language,
        handleLanguageChange,
        theme,
        toggleTheme,
        isWelcomeModalOpen,
        handleCloseWelcomeModal,
        isSupportModalOpen,
        handleCloseSupportModal,
        rateLimitError,
        setRateLimitError,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};