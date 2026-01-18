import React from 'react';
import { useTranslation } from 'react-i18next';
import { GuestProfile, LiveSessionState } from '../types';
import { Visualizer } from './Visualizer';

interface GuestCardProps {
  guest: GuestProfile;
  state?: LiveSessionState;
  analyserNode?: AnalyserNode | null;
  isAwaitingAudio?: boolean;
}

export const GuestCard: React.FC<GuestCardProps> = ({ guest, state, analyserNode, isAwaitingAudio }) => {
  const { t } = useTranslation();
  const isSpeaking = state?.isSpeaking || false;
  const isConnecting = state?.isConnecting || false;
  const isActive = state?.isActive || false;
  const error = state?.error;
  const isThinking = isAwaitingAudio && !isSpeaking && !isConnecting && !error;

  return (
    <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 bg-slate-900/40 backdrop-blur-md relative overflow-hidden group ${
      isSpeaking ? 'border-emerald-500/50 shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)]' : 'border-white/5'
    } ${error ? 'border-red-500/30' : ''}`}>
      <div className={`absolute inset-0 bg-emerald-500/5 transition-opacity duration-500 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`} />
      
      {isConnecting && (
        <div className="absolute inset-0 z-20 bg-slate-950/40 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest animate-pulse">Establishing Link...</p>
        </div>
      )}

      <div className="relative flex flex-col items-center">
        <div className={`relative mb-8 w-28 h-28 rounded-full flex items-center justify-center ${guest.avatarColor} border-4 transition-all duration-500 ${
          isSpeaking ? 'border-emerald-400 scale-105 ring-8 ring-emerald-500/10' : 'border-slate-800'
        } ${error ? 'border-red-500 animate-pulse' : ''}`}>
          <span className="text-3xl font-black text-white/90">{guest.name[0]}</span>
          {isThinking && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-950/80 border border-slate-700 rounded-full px-2 py-1">
              {[...Array(3)].map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
              <span className="text-[8px] uppercase tracking-widest text-amber-300 ml-1">{t('guestCard.thinking')}</span>
            </div>
          )}
          {isSpeaking && (
             <div className="absolute -top-1 -right-1 bg-emerald-500 p-2 rounded-full border-4 border-slate-900 shadow-lg">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                 <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                 <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
               </svg>
             </div>
          )}
          {error && (
            <div className="absolute -bottom-1 -right-1 bg-red-600 p-2 rounded-full border-4 border-slate-900 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>
        
        <h3 className="text-xl font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors">{guest.name}</h3>
        <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">{guest.role}</p>
        
        <div className="h-px w-12 bg-white/10 mb-4" />
        
        <p className="text-slate-400 text-xs text-center leading-relaxed italic mb-8 opacity-80 h-12 overflow-hidden">
          "{guest.personality}"
        </p>
        
        <div className={`w-full flex items-center justify-between p-3 rounded-2xl border ${error ? 'bg-red-500/10 border-red-500/20' : 'bg-black/20 border-white/5'}`}>
           <Visualizer isActive={isSpeaking} color={error ? "#ef4444" : isSpeaking ? "#10b981" : "#475569"} analyserNode={analyserNode} />
           <div className="flex flex-col items-end">
              <span className={`text-[8px] font-bold uppercase tracking-tighter ${error ? 'text-red-400' : isSpeaking ? 'text-emerald-400' : 'text-slate-500'}`}>
                {error ? 'Err: Offline' : isSpeaking ? 'Broadcasting' : isConnecting ? 'Initializing' : isActive ? 'Standby' : 'Offline'}
              </span>
              <div className="flex gap-0.5 mt-0.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full ${isActive ? 'bg-emerald-500' : error ? 'bg-red-500/40' : 'bg-slate-700'}`} />
                ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
