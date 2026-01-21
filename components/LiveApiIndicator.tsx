import React from 'react';
import { LiveSessionState } from '../types';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface LiveApiIndicatorProps {
  status: ConnectionStatus;
  sessions: Record<string, LiveSessionState>;
  totalGuests: number;
}

export const LiveApiIndicator: React.FC<LiveApiIndicatorProps> = ({ status, sessions, totalGuests }) => {
  const sessionStates: LiveSessionState[] = Object.values(sessions);
  const connectedCount = sessionStates.filter(s => s.isActive).length;
  const connectingCount = sessionStates.filter(s => s.isConnecting).length;
  const errorCount = sessionStates.filter(s => s.error).length;
  
  const getStatusConfig = () => {
    if (errorCount > 0 && connectedCount === 0) {
      return {
        color: 'bg-red-500',
        borderColor: 'border-red-500/30',
        bgColor: 'bg-red-500/10',
        textColor: 'text-red-300',
        label: 'Connection Failed',
        pulse: false
      };
    }
    if (connectingCount > 0) {
      return {
        color: 'bg-amber-500',
        borderColor: 'border-amber-500/30',
        bgColor: 'bg-amber-500/10',
        textColor: 'text-amber-300',
        label: `Connecting (${connectedCount}/${totalGuests})`,
        pulse: true
      };
    }
    if (connectedCount === totalGuests) {
      return {
        color: 'bg-emerald-500',
        borderColor: 'border-emerald-500/30',
        bgColor: 'bg-emerald-500/10',
        textColor: 'text-emerald-300',
        label: 'Live API Connected',
        pulse: true
      };
    }
    if (connectedCount > 0) {
      return {
        color: 'bg-amber-500',
        borderColor: 'border-amber-500/30',
        bgColor: 'bg-amber-500/10',
        textColor: 'text-amber-300',
        label: `Partial (${connectedCount}/${totalGuests})`,
        pulse: false
      };
    }
    return {
      color: 'bg-slate-500',
      borderColor: 'border-slate-500/30',
      bgColor: 'bg-slate-500/10',
      textColor: 'text-slate-400',
      label: 'Disconnected',
      pulse: false
    };
  };

  const config = getStatusConfig();

  return (
    <div className={`hidden sm:flex items-center gap-2 ${config.bgColor} border ${config.borderColor} px-3 py-1.5 rounded-md`}>
      <span className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
      <span className={`text-[10px] ${config.textColor} mono uppercase font-medium`}>
        {config.label}
      </span>
    </div>
  );
};
