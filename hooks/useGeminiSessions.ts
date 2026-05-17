import { useRef, useCallback, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { GuestProfile, LiveSessionState } from '../types';
import { buildSystemSuffix } from '../utils/debatePrompt';

interface SessionCallbacks {
  onMessage: (guestId: string, message: LiveServerMessage) => void;
  onSessionActive: (guestId: string) => void;
  onSessionError: (guestId: string, error: string) => void;
  onSessionClosed: (guestId: string) => void;
}

interface UseGeminiSessionsOptions {
  language: string;
  callbacks: SessionCallbacks;
}

// Fetch a short-lived ephemeral token from our server. The real API key never
// reaches the browser; this token is single-use and locked to the Live model.
async function fetchEphemeralToken(): Promise<string> {
  const res = await fetch('/api/token', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.token) {
    throw new Error('Token response missing token');
  }
  return data.token as string;
}

export function useGeminiSessions(options: UseGeminiSessionsOptions) {
  const { language, callbacks } = options;
  
  const [sessions, setSessions] = useState<Record<string, LiveSessionState>>({});
  
  // Store resolved sessions for efficient access
  const sessionsMapRef = useRef<Record<string, any>>({});
  
  // Track if show is running for reconnection logic
  const isShowRunningRef = useRef(false);
  
  // Store callbacks in ref to avoid stale closures
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Connect a single guest
  const connectGuest = useCallback(async (guest: GuestProfile): Promise<void> => {
    if (!isShowRunningRef.current) return;

    setSessions(prev => ({
      ...prev,
      [guest.id]: {
        isActive: false,
        isConnecting: true,
        isSpeaking: false,
        lastTranscription: '',
        lastInputTranscription: '',
      },
    }));

    let ephemeralToken: string;
    try {
      ephemeralToken = await fetchEphemeralToken();
    } catch (err) {
      console.warn(`[Sessions] Could not get token for ${guest.name}:`, err);
      setSessions(prev => ({
        ...prev,
        [guest.id]: {
          ...prev[guest.id],
          isActive: false,
          isConnecting: false,
          error: 'Connection Error',
        },
      }));
      callbacksRef.current.onSessionError(guest.id, 'Connection Error');
      if (isShowRunningRef.current) {
        setTimeout(() => connectGuest(guest), 3000);
      }
      return;
    }

    // Ephemeral tokens are only valid on the v1alpha API surface.
    const guestAi = new GoogleGenAI({
      apiKey: ephemeralToken,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const systemSuffix = buildSystemSuffix({ language });

    // Create AbortController for timeout
    const abortController = new AbortController();
    const connectionTimeout = setTimeout(() => {
      abortController.abort();
    }, 15000);

    try {
      const session = await guestAi.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: guest.voice } },
          },
          systemInstruction: `${guest.systemInstruction}${systemSuffix}`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{ googleSearch: {} }],
          // Snappy banter > deliberation: skip the thinking phase so the
          // first audio chunk starts streaming sooner (lower time-to-first-word).
          thinkingConfig: { thinkingBudget: 0 },
        },
        callbacks: {
          onopen: () => {
            clearTimeout(connectionTimeout);
            setSessions(prev => ({
              ...prev,
              [guest.id]: {
                ...prev[guest.id],
                isActive: true,
                isConnecting: false,
                error: undefined,
              },
            }));
            console.log(`[Sessions] Connection established for ${guest.name}`);
            callbacksRef.current.onSessionActive(guest.id);
          },
          onmessage: (msg: LiveServerMessage) => {
            callbacksRef.current.onMessage(guest.id, msg);
          },
          onerror: (err: any) => {
            clearTimeout(connectionTimeout);
            console.error(`[Sessions] Error for ${guest.name}:`, err);
            delete sessionsMapRef.current[guest.id];

            setSessions(prev => ({
              ...prev,
              [guest.id]: {
                ...prev[guest.id],
                isActive: false,
                isConnecting: false,
                error: 'Connection Error',
              },
            }));

            callbacksRef.current.onSessionError(guest.id, 'Connection Error');

            // Auto-reconnect if show is still running
            if (isShowRunningRef.current) {
              console.log(`[Sessions] Attempting to reconnect ${guest.name} in 2s...`);
              setTimeout(() => connectGuest(guest), 2000);
            }
          },
          onclose: (e: any) => {
            // Log code/reason — a clean open followed by an immediate close
            // (e.g. WS 1007) is otherwise invisible and looks like a hang.
            console.warn(
              `[Sessions] Session closed for ${guest.name} (code=${e?.code} reason=${e?.reason || 'n/a'})`
            );
            delete sessionsMapRef.current[guest.id];

            setSessions(prev => ({
              ...prev,
              [guest.id]: {
                ...prev[guest.id],
                isActive: false,
                isConnecting: false,
              },
            }));

            callbacksRef.current.onSessionClosed(guest.id);

            // Auto-reconnect if show is still running
            if (isShowRunningRef.current) {
              console.log(`[Sessions] Attempting to reconnect ${guest.name} in 2s...`);
              setTimeout(() => connectGuest(guest), 2000);
            }
          },
        },
      });

      clearTimeout(connectionTimeout);
      
      // Cache the resolved session
      sessionsMapRef.current[guest.id] = session;
      console.log(`[Sessions] Session cached for ${guest.name} (${guest.id})`);
    } catch (err) {
      clearTimeout(connectionTimeout);
      console.warn(`[Sessions] Connection failure for ${guest.name}:`, err);
      
      if (isShowRunningRef.current) {
        console.log(`[Sessions] Retry connection for ${guest.name} in 3s...`);
        setTimeout(() => connectGuest(guest), 3000);
      }
    }
  }, [language]);

  // Connect multiple guests
  const connectGuests = useCallback(async (guests: GuestProfile[]) => {
    isShowRunningRef.current = true;
    sessionsMapRef.current = {};

    for (const guest of guests) {
      await connectGuest(guest);
      // Small delay between connections to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }
  }, [connectGuest]);

  // Disconnect all sessions
  const disconnectAll = useCallback(() => {
    isShowRunningRef.current = false;

    Object.values(sessionsMapRef.current).forEach((session: any) => {
      try {
        session?.close();
      } catch (e) {
        // Ignore close errors
      }
    });

    sessionsMapRef.current = {};
    setSessions({});
  }, []);

  // Get a session by guest ID
  const getSession = useCallback((guestId: string) => {
    return sessionsMapRef.current[guestId] || null;
  }, []);

  // Send realtime input to a specific guest
  const sendToGuest = useCallback((guestId: string, input: { text?: string; media?: any }) => {
    const session = sessionsMapRef.current[guestId];
    if (session) {
      try {
        session.sendRealtimeInput(input);
        return true;
      } catch (e) {
        console.warn(`[Sessions] Failed to send to ${guestId}:`, e);
        delete sessionsMapRef.current[guestId];
        return false;
      }
    }
    return false;
  }, []);

  // Silently feed context to a guest WITHOUT triggering a response.
  // turnComplete:false tells the model "more is coming, don't answer yet",
  // so by the time it's this guest's turn its context (and KV cache) is
  // already warm and the turn trigger generates with much lower latency.
  const primeGuest = useCallback((guestId: string, text: string) => {
    const session = sessionsMapRef.current[guestId];
    if (!session) return false;
    try {
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: false,
      });
      return true;
    } catch (e) {
      console.warn(`[Sessions] Failed to prime ${guestId}:`, e);
      return false;
    }
  }, []);

  // Trigger a response on the SAME ordered channel as primeGuest. Using
  // sendClientContent(turnComplete:true) here (not sendRealtimeInput)
  // guarantees the model sees all primed context before this trigger —
  // a realtime-input trigger can otherwise jump ahead of queued context.
  const triggerGuest = useCallback((guestId: string, text: string) => {
    const session = sessionsMapRef.current[guestId];
    if (!session) return false;
    try {
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
      return true;
    } catch (e) {
      console.warn(`[Sessions] Failed to trigger ${guestId}:`, e);
      return false;
    }
  }, []);

  // Update session speaking state
  const updateSessionSpeaking = useCallback((guestId: string, isSpeaking: boolean) => {
    setSessions(prev => ({
      ...prev,
      [guestId]: { ...prev[guestId], isSpeaking },
    }));
  }, []);

  // Update session transcription
  const updateSessionTranscription = useCallback((
    guestId: string,
    field: 'lastTranscription' | 'lastInputTranscription',
    text: string
  ) => {
    setSessions(prev => ({
      ...prev,
      [guestId]: { ...prev[guestId], [field]: text },
    }));
  }, []);

  // Clear session transcriptions
  const clearSessionTranscriptions = useCallback((guestId: string) => {
    setSessions(prev => ({
      ...prev,
      [guestId]: {
        ...prev[guestId],
        lastTranscription: '',
        lastInputTranscription: '',
      },
    }));
  }, []);

  // Check if show is running
  const isRunning = useCallback(() => isShowRunningRef.current, []);

  return {
    sessions,
    connectGuest,
    connectGuests,
    disconnectAll,
    getSession,
    sendToGuest,
    primeGuest,
    triggerGuest,
    updateSessionSpeaking,
    updateSessionTranscription,
    clearSessionTranscriptions,
    isRunning,
  };
}
