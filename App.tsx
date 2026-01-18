
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AUDIO_CONFIG, RIVALRIES } from './constants';
import { GuestProfile, TranscriptionEntry, LiveSessionState, RivalryPair } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audio-processing';
import { Visualizer } from './components/Visualizer';
import { TranscriptionFeed } from './components/TranscriptionFeed';
import { GuestSelector } from './components/GuestSelector';
import { GuestCard } from './components/GuestCard';
import { LiveApiIndicator } from './components/LiveApiIndicator';
import { SplashScreen } from './components/SplashScreen';

interface TurnState {
  currentSpeaker: string | null;
  lastSpeaker: string | null;
  nextResponder: string | null;  // The guest who should respond next to host input
  turnStartTime: number;
  isWaitingForResponse: boolean;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [showSplash, setShowSplash] = useState(true);
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(() =>
    localStorage.getItem('smackdown_password_unlocked') === 'true'
  );
  const expectedPassword = import.meta.env.VITE_LANDING_PASSWORD as string | undefined;
  const [isLive, setIsLive] = useState(false);
  const [selectedRivalryId, setSelectedRivalryId] = useState<string | null>(null);
  const [selectedGuests, setSelectedGuests] = useState<GuestProfile[]>([]);
  const [isFeedPaused, setIsFeedPaused] = useState(false);
  
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [sessions, setSessions] = useState<Record<string, LiveSessionState>>({});
  const [apiStatus, setApiStatus] = useState<ConnectionStatus>('disconnected');
  const [hostInput, setHostInput] = useState('');

  const handleLanguageChange = (language: string) => {
    i18n.changeLanguage(language);
    localStorage.setItem('language', language);
  };

  const handleUnlock = () => {
    setIsPasswordUnlocked(true);
    localStorage.setItem('smackdown_password_unlocked', 'true');
  };
  
  // Ref to access mute state in callbacks
  const isMicMutedRef = useRef(false);
  // Ref to track if show is running for reconnection logic
  const isShowRunningRef = useRef(false);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<Record<string, number>>({});
  const sourcesRef = useRef<Record<string, Set<AudioBufferSourceNode>>>({});
  const micStreamRef = useRef<MediaStream | null>(null);
  const isFeedPausedRef = useRef(false);
  const lastLanguageRef = useRef(i18n.language);

  useEffect(() => {
    isFeedPausedRef.current = isFeedPaused;
    if (isFeedPaused) {
      Object.keys(sourcesRef.current).forEach(guestId => {
        sourcesRef.current[guestId]?.forEach(source => source.stop());
        sourcesRef.current[guestId]?.clear();
        nextStartTimeRef.current[guestId] = 0;
      });
    }
  }, [isFeedPaused]);

  useEffect(() => {
    const currentLanguage = i18n.language;
    if (!isLive || lastLanguageRef.current === currentLanguage) return;

    if (currentLanguage === 'el') {
      const languagePrompt = '[SYSTEM] Από εδώ και πέρα απάντα αποκλειστικά στα Ελληνικά. Μην χρησιμοποιείς Αγγλικά.';
      Object.values(sessionsMapRef.current).forEach((session: any) => {
        try {
          session?.sendRealtimeInput({ text: languagePrompt });
        } catch (err) {
          console.warn('[DEBUG] Failed to inject Greek language prompt:', err);
        }
      });
    }

    lastLanguageRef.current = currentLanguage;
  }, [i18n.language, isLive]);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const laughAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastLaughterAtRef = useRef(0);
  
  // AnalyserNodes for audio-reactive visualizers
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const guestAnalysersRef = useRef<Record<string, AnalyserNode>>({});
  const [analyserNodes, setAnalyserNodes] = useState<Record<string, AnalyserNode | null>>({});
  
  // Cached resolved sessions for efficient access
  const sessionsMapRef = useRef<Record<string, any>>({});
  const sessionPromisesRef = useRef<Record<string, Promise<any>>>({});
  const awaitingAudioRef = useRef<Record<string, boolean>>({});
  
  const moderatorTranscriptionLockRef = useRef<string | null>(null);
  
  // Store last transcription per guest for reliable relay
  const lastTranscriptionRef = useRef<Record<string, string>>({});
  
  // Store last host instruction to relay to all guests
  const lastHostInstructionRef = useRef<string>('');
  const pendingHostInstructionRef = useRef<string | null>(null);
  
  // SIMPLIFIED conversation state - only ONE guest can be "active" at a time
  // The active guest is the one who should respond next
  const conversationStateRef = useRef<{
    activeGuest: string | null;     // The guest who should respond (or is responding)
    isGuestSpeaking: boolean;       // Is the active guest currently producing audio?
    lastSpokenText: string;         // What the last guest said (for relay)
  }>({
    activeGuest: null,
    isGuestSpeaking: false,
    lastSpokenText: ''
  });
  
  // Legacy refs for compatibility (will clean up later)
  const turnStateRef = useRef<TurnState>({
    currentSpeaker: null,
    lastSpeaker: null,
    nextResponder: null,
    turnStartTime: 0,
    isWaitingForResponse: false
  });
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Host interruption detection (simplified)
  const hostInterruptionRef = useRef<{
    isDetecting: boolean;
    hasSignaled: boolean;
    lastDetectionTime: number;
  }>({ isDetecting: false, hasSignaled: false, lastDetectionTime: 0 });
  
  // Handle rivalry selection
  const handleRivalrySelect = (rivalry: RivalryPair) => {
    if (isLive) return; // Cannot change while live
    setSelectedRivalryId(rivalry.id);
    setSelectedGuests(rivalry.guests);
    
    // Reset state refs for new guests
    conversationStateRef.current = {
      activeGuest: rivalry.guests[0].id,
      isGuestSpeaking: false,
      lastSpokenText: ''
    };
    
    turnStateRef.current = {
      currentSpeaker: null,
      lastSpeaker: null,
      nextResponder: rivalry.guests[0].id,
      turnStartTime: 0,
      isWaitingForResponse: false
    };
  };

  // Prompt the next guest to speak after current turn ends
  const promptNextSpeaker = useCallback((excludeGuestId?: string) => {
    const turn = turnStateRef.current;
    
    // Find the next guest (alternate from last speaker)
    const nextGuest = selectedGuests.find(g => g.id !== (excludeGuestId || turn.lastSpeaker));
    if (!nextGuest) return;
    
    const session = sessionsMapRef.current[nextGuest.id];
    if (!session) return;
    
    turn.isWaitingForResponse = true;
    
    // Send a subtle prompt to encourage the next guest to respond
    const prompts = [
      `Continue the discussion. Respond to what was just said.`,
      `It's your turn to contribute to the conversation.`,
      `Share your perspective on the topic being discussed.`
    ];
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    
    session.sendRealtimeInput({ text: prompt });
  }, [selectedGuests]);

  // Track streaming entry IDs per speaker
  const streamingEntryIdRef = useRef<Record<string, string>>({});
  
  const addTranscription = useCallback((speaker: string, text: string, type: 'user' | 'ai', isStreaming = false) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    setTranscriptions(prev => {
      // Deduplicate: check if the last entry from this speaker has the same text
      const lastEntry = prev.length > 0 ? prev[prev.length - 1] : null;
      if (lastEntry && lastEntry.speaker === speaker && lastEntry.text === trimmed && !isStreaming) {
        return prev; // Skip duplicate
      }
      
      // Also check the second-to-last entry (in case of interleaved duplicates)
      const secondLastEntry = prev.length > 1 ? prev[prev.length - 2] : null;
      if (secondLastEntry && secondLastEntry.speaker === speaker && secondLastEntry.text === trimmed && !isStreaming) {
        return prev; // Skip duplicate
      }
      
      return [
        ...prev,
        { id: Math.random().toString(36).substr(2, 9), speaker, text: trimmed, timestamp: Date.now(), type, isStreaming }
      ];
    });
  }, []);

  const sendHostMessage = useCallback(() => {
    const message = hostInput.trim();
    if (!message || !isLive) return;

    addTranscription('Moderator', message, 'user');
    if (conversationStateRef.current.isGuestSpeaking) {
      pendingHostInstructionRef.current = message;
    } else {
      lastHostInstructionRef.current = message;
    }
    setHostInput('');

    const activeGuestId = conversationStateRef.current.activeGuest ?? selectedGuests[0]?.id;
    if (!activeGuestId) return;
    const session = sessionsMapRef.current[activeGuestId];
    if (session && !conversationStateRef.current.isGuestSpeaking) {
      session.sendRealtimeInput({ text: `[Host said]: "${message}"` });
    }
  }, [addTranscription, hostInput, isLive, selectedGuests]);
  
  // Update or create a streaming transcription entry
  const updateStreamingTranscription = useCallback((speaker: string, text: string, type: 'user' | 'ai', speakerId: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    setTranscriptions(prev => {
      const existingId = streamingEntryIdRef.current[speakerId];
      const existingIndex = existingId ? prev.findIndex(e => e.id === existingId) : -1;
      
      if (existingIndex >= 0) {
        // Update existing streaming entry
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], text: trimmed };
        return updated;
      } else {
        // Create new streaming entry
        const newId = Math.random().toString(36).substr(2, 9);
        streamingEntryIdRef.current[speakerId] = newId;
        return [
          ...prev,
          { id: newId, speaker, text: trimmed, timestamp: Date.now(), type, isStreaming: true }
        ];
      }
    });
  }, []);
  
  // Finalize a streaming entry (mark as complete)
  const finalizeStreamingTranscription = useCallback((speakerId: string) => {
    const entryId = streamingEntryIdRef.current[speakerId];
    if (entryId) {
      setTranscriptions(prev => 
        prev.map(e => e.id === entryId ? { ...e, isStreaming: false } : e)
      );
      delete streamingEntryIdRef.current[speakerId];
    }
  }, []);

  
  // Flag to block mic audio while waiting for text relay response
  const textRelayPendingRef = useRef<{ guestId: string | null; until: number }>({ guestId: null, until: 0 });
  
  // SIMPLE: Send prompt to the active guest only
  const promptActiveGuest = useCallback((context: string) => {
    const conv = conversationStateRef.current;
    const activeGuest = selectedGuests.find(g => g.id === conv.activeGuest);
    const session = sessionsMapRef.current[conv.activeGuest || ''];
    
    if (!session || !activeGuest) {
      console.log(`[DEBUG] Cannot prompt - no active guest or session`);
      return;
    }
    
    // Don't prompt if already speaking
    if (conv.isGuestSpeaking) {
      console.log(`[DEBUG] Skipping prompt - ${activeGuest.name} already speaking`);
      return;
    }
    
    console.log(`[DEBUG] Prompting ${activeGuest.name}: "${context.substring(0, 50)}..."`);
    try {
      session.sendRealtimeInput({ text: context });
    } catch (e) {
      console.error(`Failed to prompt ${activeGuest.name}:`, e);
      // If prompt fails, maybe try to switch to the other guest? 
      // For now, just remove the session so we don't try again
      delete sessionsMapRef.current[activeGuest.id];
      setSessions(prev => ({ 
        ...prev, 
        [activeGuest.id]: { ...prev[activeGuest.id], isActive: false, error: 'Connection Lost' } 
      }));
    }
  }, [selectedGuests]);
  
  // SIMPLE: Switch to the other guest
  const switchToOtherGuest = useCallback(() => {
    const conv = conversationStateRef.current;
    const otherGuest = selectedGuests.find(g => g.id !== conv.activeGuest);
    if (otherGuest) {
      conv.activeGuest = otherGuest.id;
      conv.isGuestSpeaking = false;
      console.log(`[DEBUG] Switched active guest to ${otherGuest.name}`);
    }
  }, [selectedGuests]);

  const handleMessage = useCallback(async (guestId: string, message: LiveServerMessage) => {
    try {
      const speakerName = selectedGuests.find(g => g.id === guestId)?.name || 'Guest';
      const session = sessionsMapRef.current[guestId];
      
      const conv = conversationStateRef.current;
      
      // CRITICAL: Only process messages from the ACTIVE guest
      // This prevents the other guest from interfering
      if (guestId !== conv.activeGuest) {
        // Ignore audio/turnComplete from non-active guest
        if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data || 
            message.serverContent?.turnComplete) {
          return; // Silently ignore
        }
      }

      if (isFeedPausedRef.current && (
        message.serverContent?.inputTranscription ||
        message.serverContent?.outputTranscription ||
        message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
        message.serverContent?.turnComplete ||
        message.serverContent?.interrupted
      )) {
        return;
      }

      // Handle input transcription (host speech)
      if (message.serverContent?.inputTranscription) {
        const text = message.serverContent.inputTranscription.text;
        setSessions(prev => {
          const newText = (prev[guestId]?.lastInputTranscription || '') + text;
          updateStreamingTranscription('Moderator', newText, 'user', 'moderator');
          lastHostInstructionRef.current = newText;
          return {
            ...prev,
            [guestId]: { ...prev[guestId], lastInputTranscription: newText }
          };
        });
      }

      // Handle output transcription (guest speech)
      if (message.serverContent?.outputTranscription) {
        const text = message.serverContent.outputTranscription.text;
        const cleanedText = text.replace(/\s*\[LAUGH\]\s*/gi, ' ');
        const shouldLaugh = shouldTriggerLaughter(text);
        lastTranscriptionRef.current[guestId] = (lastTranscriptionRef.current[guestId] || '') + cleanedText;
        conv.lastSpokenText = lastTranscriptionRef.current[guestId];

        if (!isFeedPausedRef.current) {
          setSessions(prev => {
            const newText = (prev[guestId]?.lastTranscription || '') + cleanedText;
            updateStreamingTranscription(speakerName, newText, 'ai', guestId);
            return {
              ...prev,
              [guestId]: { ...prev[guestId], lastTranscription: newText }
            };
          });

          if (shouldLaugh) {
            triggerAudienceLaughter();
          }
        }
      }

      // Handle turn complete - switch to other guest
      if (message.serverContent?.turnComplete) {
        const spokenText = lastTranscriptionRef.current[guestId] || '';
        
        // Only process if this guest actually spoke
        if (!conv.isGuestSpeaking && !spokenText.trim()) {
          return; // Empty turnComplete, ignore
        }
        
        console.log(`[DEBUG] ${speakerName} finished speaking`);
        
        // Finalize transcriptions
        finalizeStreamingTranscription('moderator');
        finalizeStreamingTranscription(guestId);
        
        setSessions(prev => ({
          ...prev,
          [guestId]: { ...prev[guestId], lastTranscription: '', lastInputTranscription: '' }
        }));
        
        // Clear awaiting flag on turn complete as fallback
        awaitingAudioRef.current[guestId] = false;
        
        // Apply any queued host message for the next turn
        if (pendingHostInstructionRef.current) {
          lastHostInstructionRef.current = pendingHostInstructionRef.current;
          pendingHostInstructionRef.current = null;
        }

        // Store what was said for relay
        conv.lastSpokenText = spokenText;
        conv.isGuestSpeaking = false;
        lastTranscriptionRef.current[guestId] = '';
        
        // Switch to other guest and prompt them
        const otherGuest = selectedGuests.find(g => g.id !== guestId);
        if (otherGuest) {
          conv.activeGuest = otherGuest.id;
          
          // Build prompt for next guest
          const hostContext = lastHostInstructionRef.current ? `[Host said]: "${lastHostInstructionRef.current}"\n\n` : '';
          const guestContext = spokenText.trim() ? `[${speakerName} said]: "${spokenText.trim()}"\n\n` : '';
          const prompt = `${hostContext}${guestContext}Now it's your turn, ${otherGuest.name}. Respond naturally. Keep it under 25 seconds.`;
          
          if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
          console.log(`[DEBUG] Prompting ${otherGuest.name} immediately`);
          const session = sessionsMapRef.current[otherGuest.id];
          if (session) {
            awaitingAudioRef.current[otherGuest.id] = true;
            session.sendRealtimeInput({ text: prompt });
          }
          
          // Clear host instruction after use
          if (lastHostInstructionRef.current) {
            setTimeout(() => { lastHostInstructionRef.current = ''; }, 5000);
          }
        }
      }

      // Handle audio output
      const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
      if (base64Audio) {
        awaitingAudioRef.current[guestId] = false;
        // Mark that active guest is now speaking
        if (!conv.isGuestSpeaking) {
          conv.isGuestSpeaking = true;
          console.log(`[DEBUG] ${speakerName} STARTED speaking`);
          
          // Clear any pending prompt timeout
          if (turnTimeoutRef.current) {
            clearTimeout(turnTimeoutRef.current);
            turnTimeoutRef.current = null;
          }
        }
        
        if (isFeedPausedRef.current) {
          setSessions(prev => ({ ...prev, [guestId]: { ...prev[guestId], isSpeaking: true } }));
          return;
        }

        if (outputAudioContextRef.current) {
          const ctx = outputAudioContextRef.current;
          const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            ctx,
            AUDIO_CONFIG.outputSampleRate,
            AUDIO_CONFIG.channels
          );

          const nextStart = Math.max(nextStartTimeRef.current[guestId] || 0, ctx.currentTime);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          
          // Connect through analyser for visualization
          let analyser = guestAnalysersRef.current[guestId];
          if (!analyser) {
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.connect(ctx.destination);
            guestAnalysersRef.current[guestId] = analyser;
            setAnalyserNodes(prev => ({ ...prev, [guestId]: analyser }));
          }
          source.connect(analyser);
          
          source.addEventListener('ended', () => {
            sourcesRef.current[guestId]?.delete(source);
            if (sourcesRef.current[guestId]?.size === 0) {
              setSessions(prev => ({ ...prev, [guestId]: { ...prev[guestId], isSpeaking: false } }));
            }
          });

          source.start(nextStart);
          nextStartTimeRef.current[guestId] = nextStart + audioBuffer.duration;
          sourcesRef.current[guestId]?.add(source);
          setSessions(prev => ({ ...prev, [guestId]: { ...prev[guestId], isSpeaking: true } }));
        }

        // REMOVED: AI-to-AI audio relay was causing VAD loop where both guests
        // would trigger each other's voice detection and talk over each other.
        // Guests now "hear" each other through text-based transcription relay only.
      }

      if (message.serverContent?.interrupted) {
        sourcesRef.current[guestId]?.forEach(s => s.stop());
        sourcesRef.current[guestId]?.clear();
        nextStartTimeRef.current[guestId] = 0;
        setSessions(prev => ({ ...prev, [guestId]: { ...prev[guestId], isSpeaking: false } }));
      }
    } catch (err) {
      console.error(`Message handling error for guest ${guestId}:`, err);
    }
  }, [addTranscription, promptNextSpeaker]);

  const connectGuest = useCallback(async (guest: GuestProfile) => {
    if (!isShowRunningRef.current) return;

    setSessions(prev => ({ 
      ...prev, 
      [guest.id]: { 
        isActive: false, 
        isConnecting: true, 
        isSpeaking: false, 
        lastTranscription: '',
        lastInputTranscription: ''
      } 
    }));

    const guestAi = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
    const globalInstructionSuffix = `\n\nGLOBAL STYLE RULES:\n- Lean into roasting, playful rival energy, and sharp humor whenever possible.\n- Prefer concise, punchy lines over long explanations.\n- If you land a punchline or roast that should get a laugh, end the sentence with the tag [LAUGH].`;
    const greekLanguageSuffix = i18n.language === 'el'
      ? '\n\nLANGUAGE RULES:\n- Always respond in Greek.\n- Use natural modern Greek.\n- Do not switch to English unless explicitly asked by the host.'
      : '';

    try {
      const connectionTimeout = setTimeout(() => {
        throw new Error(`Connection timeout for ${guest.name}`);
      }, 15000);

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
          tools: [
            { googleSearch: {} }
          ],
        },
        callbacks: {
          onopen: () => {
            clearTimeout(connectionTimeout);
            setSessions(prev => ({ 
              ...prev, 
              [guest.id]: { ...prev[guest.id], isActive: true, isConnecting: false, error: undefined } 
            }));
            console.log(`[DEBUG] Connection established for ${guest.name}`);
          },
          onmessage: (msg) => handleMessage(guest.id, msg),
          onerror: (err: any) => {
            clearTimeout(connectionTimeout);
            console.error(`Session error for ${guest.name}:`, err);
            delete sessionsMapRef.current[guest.id];
            
            setSessions(prev => ({ 
              ...prev, 
              [guest.id]: { ...prev[guest.id], isActive: false, isConnecting: false, error: 'Connection Error' } 
            }));

            // Auto-reconnect if show is still running
            if (isShowRunningRef.current) {
              console.log(`[DEBUG] Attempting to reconnect ${guest.name} in 2s...`);
              setTimeout(() => connectGuest(guest), 2000);
            }
          },
          onclose: () => {
            console.warn(`Session closed for ${guest.name}`);
            delete sessionsMapRef.current[guest.id];
            const conv = conversationStateRef.current;
            if (conv.activeGuest === guest.id) {
              conv.isGuestSpeaking = false;
              awaitingAudioRef.current[guest.id] = false;
            }
            
            setSessions(prev => ({ ...prev, [guest.id]: { ...prev[guest.id], isActive: false, isConnecting: false } }));

            // Auto-reconnect if show is still running
            if (isShowRunningRef.current) {
              console.log(`[DEBUG] Attempting to reconnect ${guest.name} in 2s...`);
              setTimeout(() => connectGuest(guest), 2000);
            }
          },
        }
      });

      // Cache the resolved session
      sessionsMapRef.current[guest.id] = session;
      sessionPromisesRef.current[guest.id] = Promise.resolve(session);
      console.log(`[DEBUG] Session cached for ${guest.name} (${guest.id})`);

      const conv = conversationStateRef.current;
      if (conv.activeGuest === guest.id && !conv.isGuestSpeaking && isShowRunningRef.current) {
        const hostContext = lastHostInstructionRef.current ? `[Host said]: "${lastHostInstructionRef.current}"\n\n` : '';
        const guestContext = conv.lastSpokenText.trim() ? `[Prev context]: "${conv.lastSpokenText.trim()}"\n\n` : '';
        const prompt = `${hostContext}${guestContext}You got disconnected. Resume your turn with a concise response.`;
        awaitingAudioRef.current[guest.id] = true;
        session.sendRealtimeInput({ text: prompt });
      }
      
    } catch (err) {
      console.warn(`Connection failure for ${guest.name}:`, err);
      if (isShowRunningRef.current) {
        console.log(`[DEBUG] Retry connection for ${guest.name} in 3s...`);
        setTimeout(() => connectGuest(guest), 3000);
      }
    }
  }, [handleMessage]);

  const startShow = async () => {
    setIsLive(true);
    isShowRunningRef.current = true;
    setTranscriptions([]);
    sessionPromisesRef.current = {};

    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_CONFIG.inputSampleRate });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_CONFIG.outputSampleRate });
    inputAudioContextRef.current = inputCtx;
    outputAudioContextRef.current = outputCtx;

    if (inputCtx.state === 'suspended') await inputCtx.resume();
    if (outputCtx.state === 'suspended') await outputCtx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    
    // Reset turn state
    turnStateRef.current = {
      currentSpeaker: null,
      lastSpeaker: null,
      turnStartTime: 0,
      isWaitingForResponse: false
    };
    sessionsMapRef.current = {};

    // Connect guests sequentially for initial startup
    for (const guest of selectedGuests) {
      sourcesRef.current[guest.id] = new Set();
      nextStartTimeRef.current[guest.id] = 0;
      // Initial connection
      await connectGuest(guest);
      // Small delay between connections to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Only send context to the first guest - they will respond to the host
    // The second guest will receive context when it's their turn via transcription relay
    const firstGuest = selectedGuests[0];
    const secondGuest = selectedGuests[1];
    
    // Initialize simplified conversation state
    conversationStateRef.current = {
      activeGuest: firstGuest.id,
      isGuestSpeaking: false,
      lastSpokenText: ''
    };
    
    // Also initialize legacy state for compatibility
    turnStateRef.current.nextResponder = firstGuest.id;
    turnStateRef.current.currentSpeaker = null;
    
    console.log(`[DEBUG] Show started - Active Guest: ${firstGuest.name}`);
    console.log(`[DEBUG] Waiting for host to speak (mic unmuted) or text relay (mic muted)`);
    
    // Create microphone analyser for visualization
    const micAnalyser = inputCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyserRef.current = micAnalyser;
    setAnalyserNodes(prev => ({ ...prev, mic: micAnalyser }));

    // Use AudioWorklet instead of deprecated ScriptProcessor
    try {
      await inputCtx.audioWorklet.addModule('/audio-worklet-processor.js');
      const source = inputCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(inputCtx, 'pcm-processor');
      workletNodeRef.current = workletNode;
      
      let lastMicLogTime = 0;
      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          const pcmBlob = createBlob(event.data.data);
          const conv = conversationStateRef.current;
          const now = Date.now();
          
          // SIMPLE LOGIC:
          // 1. If mic muted → don't send (AI-to-AI mode)
          // 2. If guest speaking → don't send (wait for turn)
          // 3. Otherwise → send to active guest
          
          if (isMicMutedRef.current) return;
          if (isFeedPausedRef.current) return;
          if (conv.isGuestSpeaking) return;
          
          // Send mic audio to active guest only
          const activeGuest = conv.activeGuest;
          if (activeGuest && sessionsMapRef.current[activeGuest]) {
            try {
              if (now - lastMicLogTime > 3000) {
                const guestName = selectedGuests.find(g => g.id === activeGuest)?.name;
                console.log(`[DEBUG] Mic audio → ${guestName}`);
                lastMicLogTime = now;
              }
              sessionsMapRef.current[activeGuest].sendRealtimeInput({ media: pcmBlob });
            } catch (e) {
              console.warn(`Failed to send audio to ${activeGuest}:`, e);
              // If socket is closed, remove it to stop trying
              if (activeGuest) delete sessionsMapRef.current[activeGuest];
            }
          }
        }
      };
      
      source.connect(micAnalyser);
      source.connect(workletNode);
      workletNode.connect(inputCtx.destination);
    } catch (workletError) {
      // Fallback to ScriptProcessor if AudioWorklet fails
      console.warn('AudioWorklet not supported, falling back to ScriptProcessor:', workletError);
      const source = inputCtx.createMediaStreamSource(stream);
      const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      let lastMicLogTimeFallback = 0;
      scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createBlob(inputData);
        const conv = conversationStateRef.current;
        const now = Date.now();
        
        // SIMPLE LOGIC (same as AudioWorklet)
        if (isMicMutedRef.current) return;
        if (isFeedPausedRef.current) return;
        if (conv.isGuestSpeaking) return;
        
        // Send mic audio to active guest only
        const activeGuest = conv.activeGuest;
        if (activeGuest && sessionsMapRef.current[activeGuest]) {
          try {
            if (now - lastMicLogTimeFallback > 3000) {
              const guestName = selectedGuests.find(g => g.id === activeGuest)?.name;
              console.log(`[DEBUG] Mic audio → ${guestName}`);
              lastMicLogTimeFallback = now;
            }
            sessionsMapRef.current[activeGuest].sendRealtimeInput({ media: pcmBlob });
          } catch (e) {
            console.warn(`Failed to send audio to ${activeGuest}:`, e);
            if (activeGuest) delete sessionsMapRef.current[activeGuest];
          }
        }
      };

      source.connect(micAnalyser);
      source.connect(scriptProcessor);
      scriptProcessor.connect(inputCtx.destination);
    }
  };

  const stopShow = () => {
    setIsLive(false);
    isShowRunningRef.current = false;
    
    // Clear turn timeout
    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }
    
    // Stop microphone
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
    
    // Disconnect worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    
    // Close all sessions
    Object.values(sessionsMapRef.current).forEach((session: any) => {
      try { session?.close(); } catch(e) {}
    });
    sessionsMapRef.current = {};
    sessionPromisesRef.current = {};
    
    // Clean up analysers
    micAnalyserRef.current = null;
    guestAnalysersRef.current = {};
    setAnalyserNodes({});
    
    // Close AudioContexts to prevent memory leak
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    
    setSessions({});
  };
  
  // Toggle mic mute
  const toggleMicMute = () => {
    const newMuteState = !isMicMuted;
    setIsMicMuted(newMuteState);
    isMicMutedRef.current = newMuteState;
    console.log(`[DEBUG] Mic ${newMuteState ? 'MUTED' : 'UNMUTED'}`);
  };

  const shouldTriggerLaughter = (text: string) => {
    if (!text.trim()) return false;
    if (/\[LAUGH\]/i.test(text)) return true;
    const punchlinePattern = /(\b(lol|haha|hahaha|lmao|rofl|joke|punchline)\b|!\s*$|\?\!|😂)/i;
    return punchlinePattern.test(text);
  };

  const triggerAudienceLaughter = () => {
    const audio = laughAudioRef.current;
    if (!audio) return;
    const now = Date.now();
    if (now - lastLaughterAtRef.current < 4000) return;
    lastLaughterAtRef.current = now;

    audio.currentTime = 0;
    void audio.play().catch(err => {
      console.warn('[DEBUG] Laughter playback failed:', err);
    });
  };

  return (
    <>
      {showSplash && (
        <SplashScreen
          onEnter={() => setShowSplash(false)}
          expectedPassword={expectedPassword}
          isUnlocked={isPasswordUnlocked}
          onUnlock={handleUnlock}
        />
      )}
      
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-4 md:p-8 overflow-hidden relative pt-24 md:pt-28">
        <header className="fixed top-0 inset-x-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
          <div className="w-full max-w-6xl mx-auto flex justify-between items-center px-4 md:px-8 py-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tighter text-white uppercase italic">
                {t('header.title').split(' ')[0]}{' '}
                <span className="text-indigo-500">{t('header.title').split(' ').slice(1).join(' ')}</span>
              </h1>
              <p className="text-slate-400 text-[10px] uppercase tracking-[0.3em] mono">{t('header.version')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition ${i18n.language === 'en' ? 'border-indigo-500 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('el')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition ${i18n.language === 'el' ? 'border-indigo-500 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
              >
                EL
              </button>
            </div>
            {selectedRivalryId && (
              <div className="flex items-center gap-4">
                <LiveApiIndicator status={apiStatus} sessions={sessions} totalGuests={selectedGuests.length} />
                <button
                  onClick={isLive ? stopShow : startShow}
                  className={`px-8 py-2.5 rounded-full font-bold uppercase text-xs tracking-widest transition-all shadow-2xl active:scale-95 ${
                    isLive 
                      ? 'bg-red-600/10 text-red-500 border border-red-500/50 hover:bg-red-600 hover:text-white' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/20'
                  }`}
                >
                  {isLive ? t('controls.shutDown') : t('controls.startDiscussion')}
                </button>
              </div>
            )}
          </div>
        </header>

      {/* Guest Selector - Only visible when not live */}
      {!isLive && (
        <GuestSelector
          selectedId={selectedRivalryId}
          onSelect={handleRivalrySelect}
        />
      )}

      {isLive && (
        <>
          <main className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 flex-1 content-center relative z-10">
            <div className={`transition-all duration-700 ${isLive ? 'opacity-100 scale-100' : 'opacity-30 scale-95 pointer-events-none'}`}>
              <GuestCard guest={selectedGuests[0]} state={sessions[selectedGuests[0].id]} analyserNode={analyserNodes[selectedGuests[0].id]} isAwaitingAudio={awaitingAudioRef.current[selectedGuests[0].id]} />
            </div>

            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="relative group">
                <button
                  onClick={isLive ? toggleMicMute : undefined}
                  disabled={!isLive}
                  className={`w-32 h-32 rounded-full flex items-center justify-center bg-slate-900 border-2 transition-all duration-500 shadow-2xl ${
                    isLive 
                      ? isMicMuted 
                        ? 'border-red-500 ring-8 ring-red-500/10 cursor-pointer hover:bg-red-900/20' 
                        : 'border-indigo-500 ring-8 ring-indigo-500/10 cursor-pointer hover:bg-indigo-900/20'
                      : 'border-slate-800'
                  }`}
                >
                  {isMicMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 transition-colors duration-500 ${isLive ? 'text-indigo-400' : 'text-slate-700'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
                {isLive && (
                  <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-black px-3 py-1 rounded shadow-lg text-white uppercase tracking-tighter ${
                    isMicMuted ? 'bg-red-600' : 'bg-indigo-600'
                  }`}>
                    {isMicMuted ? 'Muted' : 'Moderator'}
                  </div>
                )}
              </div>
              {isLive && (
                <p className="text-[10px] text-slate-500 text-center mt-2">
                  {isMicMuted ? 'AI guests will talk freely' : 'Click mic to mute'}
                </p>
              )}

              <div className="text-center">
                <h3 className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2 font-medium">{t('footer.liveFeed')}</h3>
                <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full bg-indigo-500 rounded-full transition-all duration-1000 ${isLive ? 'w-2/3 animate-pulse' : 'w-1/4'}`} />
                </div>
                <button
                  type="button"
                  onClick={() => setIsFeedPaused(prev => !prev)}
                  className="mt-4 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border border-slate-700 text-slate-200 hover:border-indigo-400 hover:text-indigo-200 transition flex items-center"
                  aria-label={isFeedPaused ? t('controls.play') : t('controls.pause')}
                >
                  {isFeedPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className={`transition-all duration-700 ${isLive ? 'opacity-100 scale-100' : 'opacity-30 scale-95 pointer-events-none'}`}>
              <GuestCard guest={selectedGuests[1]} state={sessions[selectedGuests[1].id]} analyserNode={analyserNodes[selectedGuests[1].id]} isAwaitingAudio={awaitingAudioRef.current[selectedGuests[1].id]} />
            </div>
          </main>

          <footer className="w-full max-w-5xl mt-12 group relative z-10">
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/5 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)]">
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Discussion Log</span>
                </div>
                {isLive && (
                  <span className="text-[10px] text-emerald-400 mono animate-pulse uppercase">Syncing Live Conversation...</span>
                )}
              </div>
              <div className="px-6 py-4 border-b border-white/5 bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">{t('footer.hostInput.title')}</span>
                  <div className="flex-1" />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="text"
                    value={hostInput}
                    onChange={event => setHostInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        sendHostMessage();
                      }
                    }}
                    placeholder={t('footer.hostInput.placeholder')}
                    className="flex-1 rounded-full bg-slate-950/60 border border-slate-700 px-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    disabled={!isLive}
                  />
                  <button
                    onClick={sendHostMessage}
                    disabled={!isLive || !hostInput.trim()}
                    className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500"
                  >
                    {t('footer.hostInput.send')}
                  </button>
                </div>
              </div>
              <TranscriptionFeed entries={transcriptions} />
            </div>
          </footer>
        </>
      )}

      <div className="fixed inset-0 -z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/5 blur-[180px] rounded-full" />
      </div>
      <audio ref={laughAudioRef} src="/laughter-short.mp3" preload="auto" />
    </div>
    </>
  );
};

export default App;
