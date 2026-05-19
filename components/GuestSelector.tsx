import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { RIVALRIES } from '../constants';
import { RivalryPair } from '../types';

interface GuestSelectorProps {
  // One click on a card selects the pair and starts the show immediately.
  onStart: (rivalry: RivalryPair) => void;
}

export const GuestSelector: React.FC<GuestSelectorProps> = ({ onStart }) => {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-5xl mb-8">
      <h2 className="text-heading-secondary text-center mb-4 sm:mb-6">
        {t('guestSelector.pick', { defaultValue: 'Pick a rivalry to start' })}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
      {RIVALRIES.map((rivalry) => (
        <button
          key={rivalry.id}
          onClick={() => onStart(rivalry)}
          className="relative group p-4 sm:p-6 rounded-2xl border text-left transition-all duration-300 hover:scale-[1.02] bg-slate-900/40 border-white/10 hover:border-indigo-500/60 hover:bg-slate-800/60 hover:shadow-[0_0_30px_-10px_rgba(99,102,241,0.35)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />

          <h3 className="text-heading-secondary mb-2 transition-colors text-slate-200 group-hover:text-white">
            {t(`rivalries.${rivalry.id}.name`, { defaultValue: rivalry.name })}
          </h3>

          <p className="text-body-small mb-4 sm:mb-6 line-clamp-2 sm:min-h-[40px]">
            {t(`rivalries.${rivalry.id}.description`, { defaultValue: rivalry.description })}
          </p>

          <div className="flex items-center justify-between gap-3 mt-auto">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex -space-x-3 flex-shrink-0">
                {rivalry.guests.map((guest, i) => (
                  <div
                    key={guest.id}
                    className={`w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center text-xs font-bold text-white shadow-lg ${guest.avatarColor} relative z-${10 - i}`}
                    title={guest.name}
                  >
                    {guest.name[0]}
                  </div>
                ))}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="text-xs font-semibold text-slate-200 truncate">{rivalry.guests[0].name}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">vs</p>
                <p className="text-xs font-semibold text-slate-200 truncate">{rivalry.guests[1].name}</p>
              </div>
            </div>

            <div className="text-button-secondary px-4 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0 transition-colors bg-slate-800 text-slate-400 group-hover:bg-indigo-500 group-hover:text-white">
              <Play className="w-3.5 h-3.5" />
              {t('guestSelector.start', { defaultValue: 'Start' })}
            </div>
          </div>
        </button>
      ))}
      </div>
    </div>
  );
};
