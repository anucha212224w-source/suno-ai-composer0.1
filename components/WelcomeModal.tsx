import React, { useRef, useEffect } from 'react';
import { translations } from '../translations';
import { useAppContext } from '../contexts/AppContext';

interface WelcomeModalProps {}

const InfoSection: React.FC<{
    title: string;
    content: string;
}> = ({ title, content }) => (
    <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
        <div>
            <h3 className="font-bold text-[var(--color-text-primary)]">{title}</h3>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1" dangerouslySetInnerHTML={{ __html: content }}></p>
        </div>
    </div>
);


const WelcomeModal: React.FC<WelcomeModalProps> = () => {
    const { isWelcomeModalOpen, handleCloseWelcomeModal, language } = useAppContext();
    const t = translations[language].ui;
    const modalRef = useRef<HTMLDivElement>(null);

    // Focus Trap
    useEffect(() => {
        if (!isWelcomeModalOpen) return;
        
        const modalNode = modalRef.current;
        if (!modalNode) return;

        const focusableElements = modalNode.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const closeButton = modalNode.querySelector<HTMLButtonElement>(`button[aria-label="${t.closeModal}"]`);
        (closeButton || firstElement).focus();
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!modalRef.current) return;
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
    }, [isWelcomeModalOpen, t.closeModal]);
    
    if (!isWelcomeModalOpen) return null;

    return (
        <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={handleCloseWelcomeModal}></div>

            <div 
                ref={modalRef}
                className="relative w-full max-w-2xl max-h-[90vh] bg-[var(--color-bg-light)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col animate-reveal"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-shrink-0">
                    <h2 id="welcome-modal-title" className="text-xl font-semibold text-[var(--color-text-primary)]">{t.welcomeModalTitle}</h2>
                    <button onClick={handleCloseWelcomeModal} className="p-2 text-[var(--color-text-tertiary)] rounded-full hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] transition-colors" aria-label={t.closeModal}>
                        <span className="font-bold text-lg leading-none">&times;</span>
                    </button>
                </header>
                
                <main className="flex-grow p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    <p className="text-center text-[var(--color-text-tertiary)] mb-6 text-sm">{t.welcomeModalSubtitle}</p>
                    
                    <InfoSection
                        title={t.welcomeModalSection1Title}
                        content={t.welcomeModalSection1Content}
                    />

                    <InfoSection
                        title={t.welcomeModalSection2Title}
                        content={t.welcomeModalSection2Content}
                    />

                    <InfoSection
                        title={t.welcomeModalSection3Title}
                        content={t.welcomeModalSection3Content}
                    />
                    
                    <InfoSection
                        title={t.welcomeModalSection4Title}
                        content={t.welcomeModalSection4Content}
                    />
                </main>

                <footer className="flex-shrink-0 p-4 border-t border-[var(--color-border)] bg-[var(--color-panel)] rounded-b-2xl">
                    <button onClick={handleCloseWelcomeModal} className="btn btn-primary w-full !py-2.5">
                        {t.welcomeModalGotItButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default WelcomeModal;