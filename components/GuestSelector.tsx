import React from 'react';
import { useTranslation } from 'react-i18next';
import { RIVALRIES } from '../constants';
import { RivalryPair } from '../types';

interface GuestSelectorProps {
  onSelect: (rivalry: RivalryPair) => void;
  selectedId: string;
}

export const GuestSelector: React.FC<GuestSelectorProps> = ({ onSelect, selectedId }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl mb-8">
      {RIVALRIES.map((rivalry) => {
        const isSelected = rivalry.id === selectedId;
        return (
          <button
            key={rivalry.id}
            onClick={() => onSelect(rivalry)}
            className={`relative group p-6 rounded-2xl border text-left transition-all duration-300 hover:scale-[1.02] ${
              isSelected
                ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_30px_-10px_rgba(99,102,241,0.3)]'
                : 'bg-slate-900/40 border-white/10 hover:border-white/20 hover:bg-slate-800/60'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
            
            <h3 className={`text-lg font-bold mb-2 transition-colors ${
              isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'
            }`}>
              {t(`rivalries.${rivalry.id}.name`, { defaultValue: rivalry.name })}
            </h3>
            
            <p className="text-xs text-slate-400 mb-6 leading-relaxed min-h-[40px]">
              {t(`rivalries.${rivalry.id}.description`, { defaultValue: rivalry.description })}
            </p>
            
            <div className="flex items-center justify-between mt-auto">
              <div className="flex -space-x-3">
                {rivalry.guests.map((guest, i) => (
                  <div 
                    key={guest.id}
                    className={`w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center text-xs font-bold text-white shadow-lg ${guest.avatarColor} relative z-${10-i}`}
                    title={guest.name}
                  >
                    {guest.name[0]}
                  </div>
                ))}
              </div>
              
              <div className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${
                isSelected 
                  ? 'bg-indigo-500 text-white' 
                  : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'
              }`}>
                {isSelected ? t('guestSelector.selected') : t('guestSelector.select')}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
