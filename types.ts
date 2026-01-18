
export enum GuestVoice {
  Zephyr = 'Zephyr',
  Puck = 'Puck',
  Kore = 'Kore',
  Charon = 'Charon',
  Fenrir = 'Fenrir'
}

export interface GuestProfile {
  id: string;
  name: string;
  role: string;
  voice: GuestVoice;
  personality: string;
  avatarColor: string;
  systemInstruction: string;
}

export interface RivalryPair {
  id: string;
  name: string;
  description: string;
  guests: [GuestProfile, GuestProfile];
}

export interface TranscriptionEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  type: 'user' | 'ai';
  isStreaming?: boolean;  // True while the speaker is still talking
}

export interface LiveSessionState {
  isActive: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  error?: string;
  lastTranscription: string;
  lastInputTranscription: string;
}
