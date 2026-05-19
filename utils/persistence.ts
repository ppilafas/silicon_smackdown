/**
 * Local Storage Persistence Utility
 * Handles saving and restoring app state across browser refreshes
 */

import { TranscriptionEntry } from '../types';
import { ConversationState } from '../hooks/useConversationState';

export interface PersistedLiveSession {
  // Which rivalry this session belongs to. Used so a saved transcript is
  // never restored onto a different rivalry.
  rivalryId: string | null;
  isLive: boolean;
  showStarted: boolean;
  isFeedPaused: boolean;
  conversationState: ConversationState | null;
  transcriptions: TranscriptionEntry[];
  timestamp: number;
}

export interface PersistedAppState {
  selectedRivalryId: string | null;
  hasUnlockedApp: boolean;
  lastLanguage: string;
  liveSession: PersistedLiveSession | null;
  timestamp: number;
}

const STORAGE_KEY = 'silicon_smackdown_state';
const STATE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save app state to localStorage
 */
export const saveAppState = (state: Partial<PersistedAppState>): void => {
  try {
    const existingState = getAppState();
    const newState: PersistedAppState = {
      ...existingState,
      ...state,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.error('[Persistence] Failed to save state:', error);
  }
};

/**
 * Load app state from localStorage
 */
export const getAppState = (): PersistedAppState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return getDefaultState();
    }

    const parsed: PersistedAppState = JSON.parse(stored);
    
    // Check if state has expired
    const age = Date.now() - (parsed.timestamp || 0);
    if (age > STATE_EXPIRY_MS) {
      console.log('[Persistence] State expired, clearing');
      clearAppState();
      return getDefaultState();
    }

    return parsed;
  } catch (error) {
    console.error('[Persistence] Failed to load state:', error);
    return getDefaultState();
  }
};

/**
 * Clear persisted state
 */
export const clearAppState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[Persistence] Failed to clear state:', error);
  }
};

/**
 * Get default state
 */
const getDefaultState = (): PersistedAppState => ({
  selectedRivalryId: null,
  hasUnlockedApp: false,
  lastLanguage: 'en',
  liveSession: null,
  timestamp: Date.now(),
});

/**
 * Check if user has unlocked the app (for password protection)
 */
export const hasUnlockedApp = (): boolean => {
  const state = getAppState();
  return state.hasUnlockedApp;
};

/**
 * Mark app as unlocked
 */
export const setAppUnlocked = (unlocked: boolean): void => {
  saveAppState({ hasUnlockedApp: unlocked });
  // Also update legacy key for backward compatibility
  if (unlocked) {
    localStorage.setItem('smackdown_password_unlocked', 'true');
  } else {
    localStorage.removeItem('smackdown_password_unlocked');
  }
};

/**
 * Save live session state
 */
export const saveLiveSession = (session: Partial<PersistedLiveSession>): void => {
  const currentState = getAppState();
  const existingSession = currentState.liveSession || {
    rivalryId: null,
    isLive: false,
    showStarted: false,
    isFeedPaused: false,
    conversationState: null,
    transcriptions: [],
    timestamp: Date.now(),
  };

  const updatedSession: PersistedLiveSession = {
    ...existingSession,
    ...session,
    timestamp: Date.now(),
  };

  saveAppState({ liveSession: updatedSession });
};

/**
 * Get live session state
 */
export const getLiveSession = (): PersistedLiveSession | null => {
  const state = getAppState();
  return state.liveSession;
};

/**
 * Clear live session state
 */
export const clearLiveSession = (): void => {
  saveAppState({ liveSession: null });
};
