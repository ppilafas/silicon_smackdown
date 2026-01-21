import { useRef, useCallback, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { GuestProfile, LiveSessionState } from '../types';

interface SessionCallbacks {
  onMessage: (guestId: string, message: LiveServerMessage) => void;
  onSessionActive: (guestId: string) => void;
  onSessionError: (guestId: string, error: string) => void;
  onSessionClosed: (guestId: string) => void;
}

interface UseGeminiSessionsOptions {
  apiKey: string;
  language: string;
  callbacks: SessionCallbacks;
}

export function useGeminiSessions(options: UseGeminiSessionsOptions) {
  const { apiKey, language, callbacks } = options;
  
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

    const guestAi = new GoogleGenAI({ apiKey });
    
    const globalInstructionSuffix = `\n\nGLOBAL STYLE RULES:\n- Lean into roasting, playful rival energy, and sharp humor whenever possible.\n- Prefer concise, punchy lines over long explanations.\n- If you land a punchline or roast that should get a laugh, end the sentence with the tag [LAUGH].`;
    
    const greekLanguageSuffix = language === 'el'
      ? '\n\nLANGUAGE RULES:\n- Always respond in Greek.\n- Use natural modern Greek.\n- Do not switch to English unless explicitly asked by the host.'
      : '';

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
          systemInstruction: `${guest.systemInstruction}${globalInstructionSuffix}${greekLanguageSuffix}`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{ googleSearch: {} }],
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
          onclose: () => {
            console.warn(`[Sessions] Session closed for ${guest.name}`);
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
  }, [apiKey, language]);

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
    updateSessionSpeaking,
    updateSessionTranscription,
    clearSessionTranscriptions,
    isRunning,
  };
}
