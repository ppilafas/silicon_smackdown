import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GuestProfile, LiveSessionState } from '../types';
import { Visualizer } from './Visualizer';
import { getAvatarUrl, getFallbackAvatarUrl } from '../utils/avatars';

const THINKING_MESSAGES = [
  "COOKING...",
  "LOADING ROAST...",
  "BRAIN BUFFERING...",
  "CHARGING COMEBACK...",
  "CONSULTING THE VOID...",
  "SHARPENING WIT...",
  "HEATING UP...",
  "CALCULATING BURN...",
  "PREPARING FIRE...",
  "LOADING SASS..."
];

interface GuestCardProps {
  guest: GuestProfile;
  state?: LiveSessionState;
  analyserNode?: AnalyserNode | null;
  isAwaitingAudio?: boolean;
}

export const GuestCard: React.FC<GuestCardProps> = ({ guest, state, analyserNode, isAwaitingAudio }) => {
  const { t } = useTranslation();
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [fallbackUrl, setFallbackUrl] = useState<string>('');
  const [avatarError, setAvatarError] = useState<boolean>(false);
  const [thinkingMessage, setThinkingMessage] = useState<string>(THINKING_MESSAGES[0]);
  
  const isSpeaking = state?.isSpeaking || false;
  const isConnecting = state?.isConnecting || false;
  const isActive = state?.isActive || false;
  const error = state?.error;
  const isThinking = isAwaitingAudio && !isSpeaking && !isConnecting && !error;

  // Rotate thinking messages for entertainment
  useEffect(() => {
    if (isThinking) {
      const interval = setInterval(() => {
        setThinkingMessage(THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)]);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [isThinking]);

  // Load avatar URL when component mounts
  useEffect(() => {
    console.log('[GuestCard] Mounting for guest:', guest.name);
    try {
      const primaryUrl = getAvatarUrl(guest.name);
      const fallbackUrl = getFallbackAvatarUrl(guest.name);
      console.log(`[GuestCard] Primary avatar URL for ${guest.name}:`, primaryUrl);
      console.log(`[GuestCard] Fallback avatar URL for ${guest.name}:`, fallbackUrl);
      setAvatarUrl(primaryUrl);
      setFallbackUrl(fallbackUrl);
      setAvatarError(false);
      console.log(`[GuestCard] Avatar state set for ${guest.name}, avatarError:`, false);
    } catch (error) {
      console.error('[GuestCard] Failed to load avatar:', error);
      setAvatarError(true);
    }
  }, [guest.name]);

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
        <div className={`relative mb-8 w-28 h-28 rounded-full overflow-hidden border-4 transition-all duration-500 ${
          isSpeaking ? 'border-emerald-400 scale-105 ring-8 ring-emerald-500/10' : 'border-slate-800'
        } ${error ? 'border-red-500 animate-pulse' : ''} ${isThinking ? 'animate-thinking-wobble border-amber-400/60' : ''}`}>
          {!avatarError ? (
            <img 
              src={avatarUrl} 
              alt={`${guest.name} avatar`}
              className="w-full h-full object-cover"
              onLoad={() => console.log(`Avatar loaded for ${guest.name}`)}
              onError={(e) => {
                console.error(`DiceBear avatar failed to load for ${guest.name}, trying fallback:`, e);
                // Try fallback avatar
                if (fallbackUrl) {
                  setAvatarUrl(fallbackUrl);
                } else {
                  setAvatarError(true);
                }
              }}
            />
          ) : (
            <div className={`w-full h-full ${guest.avatarColor} flex items-center justify-center`}>
              <span className="text-3xl font-black text-white/90">{guest.name[0]}</span>
            </div>
          )}
          {isThinking && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-full px-3 py-1.5 shadow-lg backdrop-blur-sm animate-pulse">
              <div className="flex items-center gap-0.5">
                <span className="text-xs animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }}>🤔</span>
                <span className="text-xs animate-bounce" style={{ animationDelay: '100ms', animationDuration: '0.6s' }}>💭</span>
                <span className="text-xs animate-bounce" style={{ animationDelay: '200ms', animationDuration: '0.6s' }}>💡</span>
              </div>
              <span className="text-status-warning ml-1 font-black">{thinkingMessage}</span>
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
        
        <h3 className="text-guest-name mb-1">{guest.name}</h3>
        <p className="text-guest-role mb-4">{guest.role}</p>
        
        <div className="h-px w-12 bg-white/10 mb-4" />
        
        <p className="text-guest-personality mb-8 h-12 overflow-hidden">
          "{guest.personality}"
        </p>
        
        <div className={`w-full flex items-center justify-between p-3 rounded-2xl border ${error ? 'bg-red-500/10 border-red-500/20' : 'bg-black/20 border-white/5'}`}>
           <Visualizer isActive={isSpeaking} color={error ? "#ef4444" : isSpeaking ? "#10b981" : "#475569"} analyserNode={analyserNode} />
           <div className="flex flex-col items-end">
              <span className={error ? 'text-status-error' : isSpeaking ? 'text-status-active' : 'text-status-inactive'}>
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
