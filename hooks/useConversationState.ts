import { useReducer, useCallback, useRef } from 'react';
import { GuestProfile } from '../types';

// Conversation state types
export interface ConversationState {
  activeGuestId: string | null;
  isGuestSpeaking: boolean;
  lastSpokenText: string;
  lastHostInstruction: string;
  pendingHostInstruction: string | null;
  awaitingAudio: Record<string, boolean>;
}

// Action types for the reducer
export type ConversationAction =
  | { type: 'SET_ACTIVE_GUEST'; guestId: string }
  | { type: 'GUEST_STARTED_SPEAKING'; guestId: string }
  | { type: 'GUEST_FINISHED_SPEAKING'; guestId: string; spokenText: string }
  | { type: 'HOST_SENT_MESSAGE'; message: string }
  | { type: 'APPLY_PENDING_HOST_INSTRUCTION' }
  | { type: 'CLEAR_HOST_INSTRUCTION' }
  | { type: 'SET_AWAITING_AUDIO'; guestId: string; awaiting: boolean }
  | { type: 'SWITCH_TO_OTHER_GUEST'; guests: GuestProfile[] }
  | { type: 'SESSION_DISCONNECTED'; guestId: string }
  | { type: 'RESET'; initialGuestId?: string };

// Initial state factory
export const createInitialState = (initialGuestId?: string): ConversationState => ({
  activeGuestId: initialGuestId || null,
  isGuestSpeaking: false,
  lastSpokenText: '',
  lastHostInstruction: '',
  pendingHostInstruction: null,
  awaitingAudio: {},
});

// Reducer function
export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case 'SET_ACTIVE_GUEST':
      return {
        ...state,
        activeGuestId: action.guestId,
        isGuestSpeaking: false,
      };

    case 'GUEST_STARTED_SPEAKING':
      // Only mark as speaking if it's the active guest
      if (action.guestId !== state.activeGuestId) return state;
      return {
        ...state,
        isGuestSpeaking: true,
        awaitingAudio: { ...state.awaitingAudio, [action.guestId]: false },
      };

    case 'GUEST_FINISHED_SPEAKING':
      if (action.guestId !== state.activeGuestId) return state;
      return {
        ...state,
        isGuestSpeaking: false,
        lastSpokenText: action.spokenText,
        awaitingAudio: { ...state.awaitingAudio, [action.guestId]: false },
        // Apply pending host instruction if any
        lastHostInstruction: state.pendingHostInstruction || state.lastHostInstruction,
        pendingHostInstruction: null,
      };

    case 'HOST_SENT_MESSAGE':
      // If guest is speaking, queue the message; otherwise apply immediately
      if (state.isGuestSpeaking) {
        return {
          ...state,
          pendingHostInstruction: action.message,
        };
      }
      return {
        ...state,
        lastHostInstruction: action.message,
      };

    case 'APPLY_PENDING_HOST_INSTRUCTION':
      if (!state.pendingHostInstruction) return state;
      return {
        ...state,
        lastHostInstruction: state.pendingHostInstruction,
        pendingHostInstruction: null,
      };

    case 'CLEAR_HOST_INSTRUCTION':
      return {
        ...state,
        lastHostInstruction: '',
      };

    case 'SET_AWAITING_AUDIO':
      return {
        ...state,
        awaitingAudio: { ...state.awaitingAudio, [action.guestId]: action.awaiting },
      };

    case 'SWITCH_TO_OTHER_GUEST': {
      const otherGuest = action.guests.find(g => g.id !== state.activeGuestId);
      if (!otherGuest) return state;
      return {
        ...state,
        activeGuestId: otherGuest.id,
        isGuestSpeaking: false,
      };
    }

    case 'SESSION_DISCONNECTED':
      if (state.activeGuestId === action.guestId) {
        return {
          ...state,
          isGuestSpeaking: false,
          awaitingAudio: { ...state.awaitingAudio, [action.guestId]: false },
        };
      }
      return state;

    case 'RESET':
      return createInitialState(action.initialGuestId);

    default:
      return state;
  }
}

// Custom hook
export function useConversationState(initialGuestId?: string) {
  const [state, dispatch] = useReducer(
    conversationReducer,
    initialGuestId,
    createInitialState
  );

  // Ref for synchronous access in callbacks (needed for audio processing)
  const stateRef = useRef(state);
  stateRef.current = state;

  // Action creators
  const setActiveGuest = useCallback((guestId: string) => {
    dispatch({ type: 'SET_ACTIVE_GUEST', guestId });
  }, []);

  const guestStartedSpeaking = useCallback((guestId: string) => {
    dispatch({ type: 'GUEST_STARTED_SPEAKING', guestId });
  }, []);

  const guestFinishedSpeaking = useCallback((guestId: string, spokenText: string) => {
    dispatch({ type: 'GUEST_FINISHED_SPEAKING', guestId, spokenText });
  }, []);

  const hostSentMessage = useCallback((message: string) => {
    dispatch({ type: 'HOST_SENT_MESSAGE', message });
  }, []);

  const clearHostInstruction = useCallback(() => {
    dispatch({ type: 'CLEAR_HOST_INSTRUCTION' });
  }, []);

  const setAwaitingAudio = useCallback((guestId: string, awaiting: boolean) => {
    dispatch({ type: 'SET_AWAITING_AUDIO', guestId, awaiting });
  }, []);

  const switchToOtherGuest = useCallback((guests: GuestProfile[]) => {
    dispatch({ type: 'SWITCH_TO_OTHER_GUEST', guests });
  }, []);

  const sessionDisconnected = useCallback((guestId: string) => {
    dispatch({ type: 'SESSION_DISCONNECTED', guestId });
  }, []);

  const reset = useCallback((initialGuestId?: string) => {
    dispatch({ type: 'RESET', initialGuestId });
  }, []);

  return {
    state,
    stateRef,
    actions: {
      setActiveGuest,
      guestStartedSpeaking,
      guestFinishedSpeaking,
      hostSentMessage,
      clearHostInstruction,
      setAwaitingAudio,
      switchToOtherGuest,
      sessionDisconnected,
      reset,
    },
  };
}
