import React from 'react';
import { useTranslation } from 'react-i18next';

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          {/* Left: Credits */}
          <div className="flex items-center gap-2">
            <span>© {currentYear} Silicon Smackdown</span>
            <span className="hidden sm:inline">•</span>
            <span className="flex items-center gap-1">
              Built by{' '}
              <a
                href="https://per4ex.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                Per4ex Studio
              </a>
            </span>
          </div>

          {/* Right: Links */}
          <div className="flex items-center gap-3">
            <a
              href="https://per4ex.org/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors"
            >
              Terms of Service
            </a>
            <span>•</span>
            <a
              href="https://per4ex.org/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors"
            >
              Privacy Policy
            </a>
            <span className="hidden sm:inline">•</span>
            <a
              href="https://github.com/ppilafas/silicon_smackdown"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors hidden sm:inline"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
