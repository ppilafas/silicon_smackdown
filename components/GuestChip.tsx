import React, { useState } from 'react';
import { GuestProfile, LiveSessionState } from '../types';
import { getAvatarUrl } from '../utils/avatars';

interface GuestChipProps {
  guest: GuestProfile;
  state?: LiveSessionState;
  isAwaitingAudio?: boolean;
}

/**
 * Compact debater used on mobile so BOTH guests stay visible at once
 * (the whole point of a "smackdown") without the full desktop card.
 */
export const GuestChip: React.FC<GuestChipProps> = ({ guest, state, isAwaitingAudio }) => {
  const [avatarUrl] = useState<string>(() => {
    try { return getAvatarUrl(guest.name); } catch { return ''; }
  });
  const [imgError, setImgError] = useState(false);

  const isSpeaking = state?.isSpeaking || false;
  const isConnecting = state?.isConnecting || false;
  const isActive = state?.isActive || false;
  const error = state?.error;
  const isThinking = isAwaitingAudio && !isSpeaking && !isConnecting && !error;

  const status = error
    ? 'Offline'
    : isSpeaking
    ? 'Speaking'
    : isThinking
    ? 'Thinking…'
    : isConnecting
    ? 'Linking…'
    : isActive
    ? 'Standby'
    : 'Idle';

  const ring = error
    ? 'border-red-500'
    : isSpeaking
    ? 'border-emerald-400 ring-4 ring-emerald-500/20'
    : isThinking
    ? 'border-amber-400/70'
    : 'border-slate-700';

  return (
    <div
      className={`flex-1 min-w-0 flex items-center gap-3 p-3 rounded-2xl border bg-slate-900/50 backdrop-blur-sm transition-all ${
        isSpeaking ? 'border-emerald-500/40' : 'border-white/5'
      }`}
    >
      <div
        className={`relative flex-shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${ring} ${
          isThinking ? 'animate-pulse' : ''
        }`}
      >
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={`${guest.name} avatar`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full ${guest.avatarColor} flex items-center justify-center`}>
            <span className="text-lg font-black text-white/90">{guest.name[0]}</span>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white truncate">{guest.name}</p>
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            error
              ? 'text-red-400'
              : isSpeaking
              ? 'text-emerald-400'
              : isThinking
              ? 'text-amber-400'
              : 'text-slate-500'
          }`}
        >
          {status}
        </p>
      </div>
    </div>
  );
};
