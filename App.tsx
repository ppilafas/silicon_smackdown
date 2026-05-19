import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { LiveServerMessage } from '@google/genai';
import { RIVALRIES } from './constants';
import { GuestProfile, RivalryPair } from './types';
import { Visualizer } from './components/Visualizer';
import { TranscriptionFeed } from './components/TranscriptionFeed';
import { GuestSelector } from './components/GuestSelector';
import { GuestCard } from './components/GuestCard';
import { GuestChip } from './components/GuestChip';
import { LiveApiIndicator } from './components/LiveApiIndicator';
import { SplashScreen } from './components/SplashScreen';
import { Footer } from './components/Footer';
import {
  useConversationState,
  useTranscription,
  useAudioPipeline,
  useGeminiSessions,
} from './hooks';
import { getAppState, saveAppState, setAppUnlocked, getLiveSession, saveLiveSession, clearLiveSession } from './utils/persistence';
import {
  DEFAULT_TARGET_TURNS,
  pickRunningGag,
  phaseForTurn,
  buildOpeningPrompt,
  buildTriggerPrompt,
  buildPrimeText,
  summarizePoints,
  distillPoint,
} from './utils/debatePrompt';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Compact live status for the discussion-log header: turn N/M, current
// debate phase, and a live/paused dot + thin progress bar.
const DebateStatus: React.FC<{
  turnIndex: number;
  targetTurns: number;
  paused: boolean;
}> = ({ turnIndex, targetTurns, paused }) => {
  const phase = phaseForTurn(turnIndex, targetTurns);
  const pct = Math.min(100, Math.round((turnIndex / Math.max(1, targetTurns)) * 100));
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="text-label-accent text-slate-400 tabular-nums whitespace-nowrap">
        Turn {Math.min(turnIndex + 1, targetTurns)}/{targetTurns}
      </span>
      <span className="text-label-accent text-indigo-300 uppercase tracking-wider hidden sm:inline">
        {phase}
      </span>
      <span className="w-12 h-1 rounded-full bg-slate-700 overflow-hidden hidden sm:block">
        <span
          className="block h-full bg-indigo-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        className={`flex items-center gap-1 text-label-accent whitespace-nowrap ${
          paused ? 'text-amber-400' : 'text-emerald-400'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
        {paused ? 'Paused' : 'Live'}
      </span>
    </div>
  );
};

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  
  // Load persisted state
  const persistedState = getAppState();
  
  // UI State
  const [showSplash, setShowSplash] = useState(() => {
    // Skip splash if user has already selected a rivalry
    return !persistedState.selectedRivalryId;
  });
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(() => persistedState.hasUnlockedApp);
  const expectedPassword = import.meta.env.VITE_LANDING_PASSWORD as string | undefined;
  const [isLive, setIsLive] = useState(false);
  const [selectedRivalryId, setSelectedRivalryId] = useState<string | null>(() => persistedState.selectedRivalryId);
  const [selectedGuests, setSelectedGuests] = useState<GuestProfile[]>(() => {
    // Restore selected guests from persisted rivalry
    if (persistedState.selectedRivalryId) {
      const rivalry = RIVALRIES.find(r => r.id === persistedState.selectedRivalryId);
      return rivalry?.guests || [];
    }
    return [];
  });
  const [isFeedPaused, setIsFeedPaused] = useState(() => {
    const session = getLiveSession();
    return session?.isFeedPaused ?? false;
  });
  const [showStarted, setShowStarted] = useState(() => {
    const session = getLiveSession();
    return session?.showStarted ?? false;
  });
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [apiStatus, setApiStatus] = useState<ConnectionStatus>('disconnected');
  const [hostInput, setHostInput] = useState('');
  const [sessionRestored, setSessionRestored] = useState(false);

  // Refs for synchronous access in callbacks
  const isMicMutedRef = useRef(false);
  const isFeedPausedRef = useRef(false);
  const lastLanguageRef = useRef(i18n.language);
  const laughAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastLaughterAtRef = useRef(0);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingRef = useRef(false); // guards against double-start (rapid card clicks)

  // Synchronous source of truth for who is on-mic. conversation.stateRef
  // lags behind dispatches (React commits later), so a cut-off speaker's
  // in-flight WS chunks would still be processed for a few frames. These
  // refs are updated imperatively the instant we switch, so stale chunks
  // are dropped immediately and "STARTED speaking" fires once per turn.
  const activeGuestIdRef = useRef<string | null>(null);
  const speakingGuestIdRef = useRef<string | null>(null);

  // Tracks how much of the speaking guest's transcript has already been
  // streamed into the rival's session as warm context (see primeRival).
  const primeRef = useRef<{ speakerId: string | null; primedLen: number; lastPrimeAt: number }>({
    speakerId: null,
    primedLen: 0,
    lastPrimeAt: 0,
  });
  const PRIME_MIN_DELTA = 80;   // chars of new transcript before priming
  const PRIME_MIN_INTERVAL = 1500; // ms between primes (bounds # of messages)

  // Custom hooks
  const conversation = useConversationState(selectedGuests[0]?.id);
  const transcription = useTranscription();
  const audio = useAudioPipeline();

  // Switch the on-mic guest. Updates the synchronous refs FIRST (so the
  // previous speaker's in-flight chunks are dropped this instant) then the
  // reducer.
  const setActiveGuestSync = useCallback((id: string) => {
    activeGuestIdRef.current = id;
    speakingGuestIdRef.current = null; // fresh turn — not speaking yet
    conversation.actions.setActiveGuest(id);
  }, [conversation]);

  // Session message handler
  const handleSessionMessage = useCallback((guestId: string, message: LiveServerMessage) => {
    const speakerName = selectedGuests.find(g => g.id === guestId)?.name || 'Guest';
    const convState = conversation.stateRef.current;

    // Hard guard: use the synchronous ref (falls back to reducer state before
    // the first turn). A guest that was just cut off is no longer the active
    // id here, so ALL of its still-streaming serverContent is dropped
    // immediately — no audio blip, no stale transcription, no double-trigger.
    const activeId = activeGuestIdRef.current ?? convState.activeGuestId;
    if (guestId !== activeId && message.serverContent) {
      return;
    }

    // Skip processing if feed is paused
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
      geminiSessions.updateSessionTranscription(guestId, 'lastInputTranscription', 
        (geminiSessions.sessions[guestId]?.lastInputTranscription || '') + text
      );
      const newText = (geminiSessions.sessions[guestId]?.lastInputTranscription || '') + text;
      transcription.updateStreamingTranscription('Moderator', newText, 'user', 'moderator');
      conversation.actions.hostSentMessage(newText);
    }

    // Handle output transcription (guest speech)
    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      const cleanedText = text.replace(/\s*\[LAUGH\]\s*/gi, ' ');
      const shouldLaugh = shouldTriggerLaughter(text);
      
      transcription.accumulateText(guestId, cleanedText);

      if (!isFeedPausedRef.current) {
        const accumulated = transcription.getAccumulatedText(guestId);
        geminiSessions.updateSessionTranscription(guestId, 'lastTranscription', accumulated);
        transcription.updateStreamingTranscription(speakerName, accumulated, 'ai', guestId);

        if (shouldLaugh) {
          triggerAudienceLaughter();
          transcription.markStreamingLaughed(guestId);
        }

        // Warm the rival's context with what this guest is saying, while
        // they're still saying it (turnComplete:false → rival stays silent).
        // By the turn boundary the rival has already ingested most of this,
        // so its trigger generates with much lower latency.
        const rival = selectedGuests.find(g => g.id !== guestId);
        if (rival) {
          const p = primeRef.current;
          if (p.speakerId !== guestId) {
            p.speakerId = guestId;
            p.primedLen = 0;
            p.lastPrimeAt = 0;
          }
          const delta = accumulated.slice(p.primedLen);
          const now = Date.now();
          if (delta.length >= PRIME_MIN_DELTA && now - p.lastPrimeAt >= PRIME_MIN_INTERVAL) {
            geminiSessions.primeGuest(rival.id, buildPrimeText({ speaker: speakerName, delta }));
            p.primedLen = accumulated.length;
            p.lastPrimeAt = now;
          }
        }
      }
    }

    // Handle turn complete - switch to other guest
    if (message.serverContent?.turnComplete) {
      const spokenText = transcription.getAccumulatedText(guestId);

      // Only process if this guest actually spoke
      if (!convState.isGuestSpeaking && !spokenText.trim()) {
        return;
      }

      console.log(`[App] ${speakerName} finished speaking`);

      // Finalize transcriptions
      transcription.finalizeStreamingTranscription('moderator');
      transcription.finalizeStreamingTranscription(guestId);
      geminiSessions.clearSessionTranscriptions(guestId);

      // Update conversation state
      conversation.actions.guestFinishedSpeaking(guestId, spokenText);
      transcription.clearAccumulatedText(guestId);

      // Switch to other guest and prompt them
      const otherGuest = selectedGuests.find(g => g.id !== guestId);
      if (otherGuest) {
        setActiveGuestSync(otherGuest.id);

        // Flush any transcript not yet primed into the rival, then reset so
        // the next speaker's priming starts fresh.
        const p = primeRef.current;
        if (p.speakerId === guestId && spokenText.length > p.primedLen) {
          const tail = spokenText.slice(p.primedLen).trim();
          if (tail) {
            geminiSessions.primeGuest(
              otherGuest.id,
              buildPrimeText({ speaker: speakerName, delta: tail, final: true })
            );
          }
        }
        primeRef.current = { speakerId: null, primedLen: 0, lastPrimeAt: 0 };

        // Record the point just made and advance the arc, then build a
        // phase-aware trigger with an anti-repetition digest. The rival
        // already has the transcript via priming, so the trigger stays small.
        const point = distillPoint(spokenText);
        const nextTurnIndex = convState.turnIndex + 1;
        const phase = phaseForTurn(nextTurnIndex, convState.targetTurns);
        const pointsDigest = summarizePoints([...convState.pointsMade, point]);
        conversation.actions.advanceTurn(point);

        // A host message sent mid-turn lands in pendingHostInstruction and is
        // only promoted to lastHostInstruction by the reducer AFTER this
        // snapshot was taken — so read both, else it's silently dropped.
        const hostMsg = (
          convState.pendingHostInstruction || convState.lastHostInstruction || ''
        ).trim();

        const prompt = buildTriggerPrompt({
          speaker: otherGuest.name,
          phase,
          turnIndex: nextTurnIndex,
          targetTurns: convState.targetTurns,
          runningGag: convState.runningGag || 'an escalating absurd shared bit',
          hostInstruction: hostMsg || undefined,
          pointsDigest,
        });

        if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
        console.log(`[App] Prompting ${otherGuest.name} immediately`);

        conversation.actions.setAwaitingAudio(otherGuest.id, true);
        geminiSessions.triggerGuest(otherGuest.id, prompt);

        // Delivered in this turn's trigger — clear deterministically so it
        // doesn't repeat next turn and isn't wiped by a blind timeout first.
        if (hostMsg) {
          conversation.actions.clearHostInstruction();
        }
      }
    }

    // Handle audio output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      conversation.actions.setAwaitingAudio(guestId, false);
      
      // Mark that active guest is now speaking — guard on the synchronous
      // ref so rapid audio chunks don't re-fire this once per chunk.
      if (speakingGuestIdRef.current !== guestId) {
        speakingGuestIdRef.current = guestId;
        conversation.actions.guestStartedSpeaking(guestId);
        console.log(`[App] ${speakerName} STARTED speaking`);

        if (turnTimeoutRef.current) {
          clearTimeout(turnTimeoutRef.current);
          turnTimeoutRef.current = null;
        }
      }

      if (isFeedPausedRef.current) {
        geminiSessions.updateSessionSpeaking(guestId, true);
        return;
      }

      // Play the audio
      audio.playGuestAudio(guestId, base64Audio, (isSpeaking) => {
        geminiSessions.updateSessionSpeaking(guestId, isSpeaking);
      });
    }

    // Handle interruption
    if (message.serverContent?.interrupted) {
      audio.stopGuestAudio(guestId);
      geminiSessions.updateSessionSpeaking(guestId, false);
    }
  }, [selectedGuests, conversation, transcription, audio, setActiveGuestSync]);

  // Gemini sessions hook
  const geminiSessions = useGeminiSessions({
    language: i18n.language,
    callbacks: {
      onMessage: handleSessionMessage,
      onSessionActive: (guestId) => {
        console.log(`[App] Session active: ${guestId}`);
      },
      onSessionError: (guestId, error) => {
        conversation.actions.sessionDisconnected(guestId);
      },
      onSessionClosed: (guestId) => {
        conversation.actions.sessionDisconnected(guestId);
      },
    },
  });

  // Sync refs with state
  useEffect(() => {
    isFeedPausedRef.current = isFeedPaused;
    if (isFeedPaused) {
      audio.stopAllAudio();
    }
  }, [isFeedPaused, audio]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Restore live session on mount
  useEffect(() => {
    const session = getLiveSession();
    const sameRivalry = !!session && session.rivalryId === selectedRivalryId;

    if (session && session.isLive && sameRivalry && selectedGuests.length > 0) {
      console.log('[App] Restoring live session from localStorage');

      if (session.transcriptions && session.transcriptions.length > 0) {
        session.transcriptions.forEach(entry => {
          transcription.addTranscription(entry.speaker, entry.text, entry.type, false);
        });
      }

      setSessionRestored(true);
      // We don't auto-reconnect Gemini sessions on refresh — the user
      // clicks "Start Discussion" to reconnect.
      console.log('[App] Session restored. Click "Start Discussion" to reconnect.');
    } else if (session && !sameRivalry) {
      // Saved session belongs to a different rivalry — discard it so its
      // transcript can't leak into this one.
      console.log('[App] Discarding stale session from a different rivalry');
      clearLiveSession();
    }
  }, []); // Run once on mount

  // Persist live session state changes
  useEffect(() => {
    if (isLive) {
      saveLiveSession({
        rivalryId: selectedRivalryId,
        isLive: true,
        showStarted,
        isFeedPaused,
        conversationState: conversation.state,
        transcriptions: transcription.transcriptions,
      });
    }
  }, [isLive, showStarted, isFeedPaused, conversation.state, transcription.transcriptions, selectedRivalryId]);

  // Language change handler for live sessions
  useEffect(() => {
    const currentLanguage = i18n.language;
    if (!isLive || lastLanguageRef.current === currentLanguage) return;

    if (currentLanguage === 'el') {
      const languagePrompt = '[SYSTEM] Από εδώ και πέρα απάντα αποκλειστικά στα Ελληνικά. Μην χρησιμοποιείς Αγγλικά.';
      selectedGuests.forEach(guest => {
        geminiSessions.sendToGuest(guest.id, { text: languagePrompt });
      });
    }

    lastLanguageRef.current = currentLanguage;
  }, [i18n.language, isLive, selectedGuests, geminiSessions]);

  // Handlers
  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    lastLanguageRef.current = lang;
    saveAppState({ lastLanguage: lang });
  };

  const handleUnlock = () => {
    setIsPasswordUnlocked(true);
    setAppUnlocked(true);
    localStorage.setItem('smackdown_password_unlocked', 'true');
  };

  // One click from a rivalry card: select it AND go straight into the show.
  const handleStartRivalry = (rivalry: RivalryPair) => {
    if (isLive) return;
    setSelectedRivalryId(rivalry.id);
    setSelectedGuests(rivalry.guests);
    setShowSplash(false);
    saveAppState({ selectedRivalryId: rivalry.id });
    void startShow(rivalry);
  };

  // Discard the recovered session and begin from a clean slate.
  const startFresh = () => {
    transcription.clearTranscriptions();
    clearLiveSession();
    conversation.actions.reset(selectedGuests[0]?.id);
    setSessionRestored(false);
  };

  const toggleMicMute = () => {
    const newMuteState = !isMicMuted;
    setIsMicMuted(newMuteState);
    isMicMutedRef.current = newMuteState;
    console.log(`[App] Mic ${newMuteState ? 'MUTED' : 'UNMUTED'}`);
  };

  // Shared by the desktop and mobile play/pause controls.
  const handlePlayPauseToggle = () => {
    if (isFeedPaused && !showStarted) {
      // First start: unpause and kick off the opening turn.
      setIsFeedPaused(false);
      isFeedPausedRef.current = false;
      setShowStarted(true);
      const firstGuest = selectedGuests[0];
      if (firstGuest) {
        const cs = conversation.stateRef.current;
        const startPrompt = buildOpeningPrompt({
          speaker: firstGuest.name,
          rival: selectedGuests[1]?.name ?? 'your rival',
          runningGag: cs.runningGag || 'an escalating absurd shared bit',
          targetTurns: cs.targetTurns || DEFAULT_TARGET_TURNS,
        });
        geminiSessions.sendToGuest(firstGuest.id, { text: startPrompt });
        console.log(`[App] Show started! Sent opening prompt to ${firstGuest.name}`);
      }
    } else if (isFeedPaused && showStarted) {
      setIsFeedPaused(false);
      isFeedPausedRef.current = false;
      console.log('[App] Show resumed - conversation continues');
    } else {
      setIsFeedPaused(true);
      isFeedPausedRef.current = true;
      console.log('[App] Show paused');
    }
  };

  const sendHostMessage = useCallback(() => {
    const message = hostInput.trim();
    if (!message || !isLive) return;

    transcription.addTranscription('Moderator', message, 'user');
    conversation.actions.hostSentMessage(message);
    setHostInput('');

    const cs = conversation.stateRef.current;

    // Paused / not started yet: just queue it — the turnComplete handler
    // injects pendingHostInstruction into the next trigger on resume.
    if (isFeedPausedRef.current || !showStarted) return;

    // MODERATOR CUT-IN: stop the current speaker mid-turn and immediately
    // hand the next turn to the rival, leading with the host instruction —
    // like a real host interjecting. The cut speaker's session keeps
    // generating but is no longer active, so handleSessionMessage ignores
    // its audio/turnComplete (no double-trigger).
    const cutId = cs.activeGuestId;
    const nextGuest = selectedGuests.find(g => g.id !== cutId) || selectedGuests[0];
    if (!nextGuest) return;

    if (cutId) {
      audio.stopGuestAudio(cutId);
      geminiSessions.updateSessionSpeaking(cutId, false);
      transcription.finalizeStreamingTranscription(cutId);
      transcription.clearAccumulatedText(cutId);
    }
    primeRef.current = { speakerId: null, primedLen: 0, lastPrimeAt: 0 };

    const nextTurnIndex = cs.turnIndex + 1;
    const phase = phaseForTurn(nextTurnIndex, cs.targetTurns);
    const pointsDigest = summarizePoints(cs.pointsMade);
    conversation.actions.advanceTurn(''); // advance arc, don't log host words as a "point"
    setActiveGuestSync(nextGuest.id);
    conversation.actions.setAwaitingAudio(nextGuest.id, true);
    conversation.actions.clearHostInstruction(); // consumed by this cut-in

    const prompt = buildTriggerPrompt({
      speaker: nextGuest.name,
      phase,
      turnIndex: nextTurnIndex,
      targetTurns: cs.targetTurns,
      runningGag: cs.runningGag || 'an escalating absurd shared bit',
      hostInstruction: message,
      pointsDigest,
    });
    console.log(`[App] Host cut-in → ${nextGuest.name}`);
    geminiSessions.triggerGuest(nextGuest.id, prompt);
  }, [hostInput, isLive, showStarted, selectedGuests, transcription, conversation, geminiSessions, audio, setActiveGuestSync]);

  const shouldTriggerLaughter = (text: string) => {
    if (!text.trim()) return false;
    if (/\[LAUGH\]/i.test(text)) return true;
    const punchlinePattern = /(\b(lol|haha|hahaha|lmao|rofl|joke|punchline)\b|!\s*$|\?\!|😂)/i;
    return punchlinePattern.test(text);
  };

  const triggerAudienceLaughter = () => {
    const audioEl = laughAudioRef.current;
    if (!audioEl) return;
    const now = Date.now();
    if (now - lastLaughterAtRef.current < 4000) return;
    lastLaughterAtRef.current = now;

    audioEl.currentTime = 0;
    void audioEl.play().catch(err => {
      console.warn('[App] Laughter playback failed:', err);
    });
  };

  // Start the show
  const startShow = async (rivalry?: RivalryPair) => {
    // When started straight from a rivalry card, the selection state setters
    // haven't applied yet, so use the passed rivalry's guests directly.
    const guests = rivalry ? rivalry.guests : selectedGuests;
    if (guests.length === 0) return;
    if (isStartingRef.current || isLive) return; // ignore rapid re-clicks
    isStartingRef.current = true;
    const gagSeed = (rivalry ? rivalry.id : selectedRivalryId) || guests[0]?.id || 'show';
    const rivalryId = (rivalry ? rivalry.id : selectedRivalryId) || null;

    try {
    setIsLive(true);
    setIsMicMuted(true); // Start with mic muted
    isMicMutedRef.current = true;
    setIsFeedPaused(true); // Start paused
    isFeedPausedRef.current = true;
    setShowStarted(false); // Reset show started flag
    setSessionRestored(false); // Clear restored flag
    
    // Keep the transcript only when genuinely resuming the SAME rivalry's
    // recovered session; otherwise start clean (and drop the stale one).
    const existingSession = getLiveSession();
    const resumingSameRivalry =
      !!existingSession?.isLive && existingSession.rivalryId === rivalryId;
    if (!resumingSameRivalry) {
      transcription.clearTranscriptions();
      clearLiveSession();
    }

    // Save initial live session state
    saveLiveSession({
      rivalryId,
      isLive: true,
      showStarted: false,
      isFeedPaused: true,
      conversationState: conversation.state,
      transcriptions: transcription.transcriptions,
    });

    // Initialize audio pipeline
    await audio.initialize();

    // Initialize audio for each guest
    guests.forEach(guest => {
      audio.initializeGuestAudio(guest.id);
    });

    // Connect guests
    await geminiSessions.connectGuests(guests);

    // Reset conversation state and seed the debate arc (running gag + length)
    conversation.actions.reset(guests[0].id);
    activeGuestIdRef.current = guests[0].id;
    speakingGuestIdRef.current = null;
    conversation.actions.configureDebate(DEFAULT_TARGET_TURNS, pickRunningGag(gagSeed));

    console.log(`[App] Show started - Active Guest: ${guests[0].name} (Paused, waiting for user to start)`);

    // Setup mic capture
    await audio.setupMicCapture(
      () => {
        // Should send audio check
        if (isMicMutedRef.current) return false;
        if (isFeedPausedRef.current) return false;
        if (conversation.stateRef.current.isGuestSpeaking) return false;
        return true;
      },
      () => {
        // Get target session
        const activeGuestId = conversation.stateRef.current.activeGuestId;
        if (activeGuestId) {
          return geminiSessions.getSession(activeGuestId);
        }
        return null;
      }
    );
    } finally {
      isStartingRef.current = false;
    }
  };

  // Stop the show
  const stopShow = () => {
    isStartingRef.current = false;
    setIsLive(false);
    setShowStarted(false);
    setIsFeedPaused(false);
    activeGuestIdRef.current = null;
    speakingGuestIdRef.current = null;

    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }

    geminiSessions.disconnectAll();
    audio.cleanup();
    
    // Clear live session from persistence
    clearLiveSession();
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

      <div className={`min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-between p-4 md:p-8 overflow-x-hidden relative pt-[4.5rem] md:pt-28 md:pb-8 ${isLive ? 'pb-3' : 'pb-24'}`}>
        <header className="fixed top-0 inset-x-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl safe-top">
          <div className="w-full max-w-6xl mx-auto flex justify-between items-center gap-2 px-3 sm:px-8 py-2.5 sm:py-4">
            {/* Brand */}
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/big_hero_logo.png"
                alt="Silicon Smackdown"
                className="h-7 sm:h-10 w-auto object-contain flex-shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-xl font-bold tracking-tighter text-white uppercase italic whitespace-nowrap">
                    Silicon Smackdown
                  </h1>
                  <span className="hidden sm:inline-flex px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                    Beta
                  </span>
                </div>
                <p className="hidden sm:block text-mono-small">{t('header.version')}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              {selectedRivalryId && !isLive && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSplash(true);
                    setSelectedRivalryId(null);
                    setSelectedGuests([]);
                    saveAppState({ selectedRivalryId: null });
                  }}
                  className="p-2 sm:px-4 sm:py-2 rounded-full border-2 border-slate-700 hover:border-indigo-500 bg-slate-900/40 hover:bg-indigo-500/10 transition-all text-button-secondary text-slate-400 hover:text-indigo-300 flex items-center gap-2"
                  title="Change Rivalry"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="hidden md:inline">Change Rivalry</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`w-8 h-8 text-xl sm:w-10 sm:h-10 sm:text-3xl rounded-full border-2 transition-all flex items-center justify-center hover:scale-110 ${i18n.language === 'en' ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'}`}
                title="English"
              >
                🇬🇧
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('el')}
                className={`w-8 h-8 text-xl sm:w-10 sm:h-10 sm:text-3xl rounded-full border-2 transition-all flex items-center justify-center hover:scale-110 ${i18n.language === 'el' ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'}`}
                title="Ελληνικά"
              >
                🇬🇷
              </button>
              {selectedRivalryId && (
                <>
                  <span className="hidden sm:block">
                    <LiveApiIndicator status={apiStatus} sessions={geminiSessions.sessions} totalGuests={selectedGuests.length} />
                  </span>
                  <button
                    onClick={isLive ? stopShow : () => startShow()}
                    className={`px-3 py-1.5 text-[11px] sm:px-8 sm:py-2.5 sm:text-sm rounded-full text-button-primary whitespace-nowrap transition-all shadow-2xl active:scale-95 ${
                      isLive
                        ? 'bg-red-600/10 text-red-500 border border-red-500/50 hover:bg-red-600 hover:text-white'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/20'
                    }`}
                  >
                    {isLive ? t('controls.shutDown') : t('controls.startDiscussion')}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Session Restored Notification */}
        {sessionRestored && !isLive && selectedRivalryId && (
          <div className="w-full max-w-6xl mx-auto mb-6 animate-fade-in">
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-2xl p-4 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-button-primary text-amber-300 mb-1">Session Recovered!</h3>
                  <p className="text-body-small text-amber-200/80">
                    Your previous discussion was restored. <strong>"Start Discussion"</strong> resumes it, or start over.
                  </p>
                </div>
                <button
                  onClick={startFresh}
                  className="flex-shrink-0 px-4 py-2 rounded-full border border-amber-500/50 text-amber-300 hover:bg-amber-500/15 transition-colors text-button-secondary"
                >
                  Start fresh
                </button>
                <button
                  onClick={() => setSessionRestored(false)}
                  aria-label="Dismiss"
                  className="flex-shrink-0 text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Guest Selector - Only visible when not live */}
        {!isLive && (
          <GuestSelector onStart={handleStartRivalry} />
        )}

        {isLive && (
          <>
            {/* ---------- MOBILE live layout (both debaters visible, transcript-primary, sticky controls) ---------- */}
            <div className="md:hidden w-full flex-1 flex flex-col gap-3 relative z-10">
              <div className="flex gap-2">
                <GuestChip
                  guest={selectedGuests[0]}
                  state={geminiSessions.sessions[selectedGuests[0].id]}
                  isAwaitingAudio={conversation.state.awaitingAudio[selectedGuests[0].id]}
                />
                <GuestChip
                  guest={selectedGuests[1]}
                  state={geminiSessions.sessions[selectedGuests[1].id]}
                  isAwaitingAudio={conversation.state.awaitingAudio[selectedGuests[1].id]}
                />
              </div>

              {/* Controls — above the conversation history */}
              <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMicMute}
                    aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center border-2 transition-all ${
                      isMicMuted
                        ? 'border-red-500 text-red-400 bg-red-900/20'
                        : 'border-indigo-500 text-indigo-300 bg-indigo-900/20'
                    }`}
                  >
                    {isMicMuted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l4-4m0 4l-4-4" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handlePlayPauseToggle}
                    className={`flex-1 h-12 rounded-full text-button-primary border transition flex items-center justify-center gap-2 ${
                      isFeedPaused
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-700 text-slate-200'
                    }`}
                  >
                    {isFeedPaused ? (
                      <>
                        <Play className="w-4 h-4" />
                        <span>{showStarted ? 'Resume' : 'Start Show'}</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>Pause</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
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
                    className="flex-1 min-w-0 rounded-full bg-slate-900/80 border border-slate-700 px-4 py-2.5 text-body-small text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    disabled={!isLive}
                  />
                  <button
                    onClick={sendHostMessage}
                    disabled={!isLive || !hostInput.trim()}
                    className="flex-shrink-0 px-4 py-2.5 rounded-full text-button-secondary bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('footer.hostInput.send')}
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-[42dvh] flex flex-col rounded-2xl overflow-hidden border border-white/5 bg-slate-900/80 backdrop-blur-xl safe-bottom">
                <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-white/5 bg-white/5">
                  <span className="text-label-secondary flex-shrink-0">Discussion</span>
                  <DebateStatus
                    turnIndex={conversation.state.turnIndex}
                    targetTurns={conversation.state.targetTurns}
                    paused={isFeedPaused}
                  />
                </div>
                <TranscriptionFeed entries={transcription.transcriptions} guests={selectedGuests} fill />
              </div>
            </div>

            {/* ---------- DESKTOP live layout (unchanged) ---------- */}
            <main className="hidden md:grid w-full max-w-6xl md:grid-cols-3 gap-8 flex-1 content-center relative z-10">
              <div className={`transition-all duration-700 ${isLive ? 'opacity-100 scale-100' : 'opacity-30 scale-95 pointer-events-none'}`}>
                <GuestCard
                  guest={selectedGuests[0]}
                  state={geminiSessions.sessions[selectedGuests[0].id]}
                  analyserNode={audio.analyserNodes[selectedGuests[0].id]}
                  isAwaitingAudio={conversation.state.awaitingAudio[selectedGuests[0].id]}
                />
              </div>

              <div className="flex flex-col items-center justify-center space-y-6">
                {/* Hero Logo */}
                <img 
                  src="/big_hero_logo.png" 
                  alt="Silicon Smackdown" 
                  className="w-40 h-auto object-contain opacity-80"
                />
                
                <div className="relative group">
                  <button
                    onClick={isLive ? toggleMicMute : undefined}
                    disabled={!isLive}
                    className={`w-24 h-24 rounded-full flex items-center justify-center bg-slate-900 border-2 transition-all duration-500 shadow-2xl ${
                      isLive
                        ? isMicMuted
                          ? 'border-red-500 ring-8 ring-red-500/10 cursor-pointer hover:bg-red-900/20'
                          : 'border-indigo-500 ring-8 ring-indigo-500/10 cursor-pointer hover:bg-indigo-900/20'
                        : 'border-slate-800'
                    }`}
                  >
                    {isMicMuted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 transition-colors duration-500 ${isLive ? 'text-indigo-400' : 'text-slate-700'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </button>
                  {isLive && (
                    <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-black px-3 py-1 rounded shadow-lg text-white uppercase tracking-tighter ${
                      isMicMuted ? 'bg-red-600' : 'bg-indigo-600'
                    }`}>
                      {isMicMuted ? 'MUTED' : 'MODERATOR'}
                    </div>
                  )}
                </div>
                {isLive && (
                  <p className="text-body-tiny text-center mt-2">
                    {isMicMuted ? 'AI guests will talk freely' : 'Click mic to mute'}
                  </p>
                )}

                <div className="text-center">
                  <h3 className="text-label-primary mb-2">{t('footer.liveFeed')}</h3>
                  <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-indigo-500 rounded-full transition-all duration-1000 ${isLive ? 'w-2/3 animate-pulse' : 'w-1/4'}`} />
                  </div>
                  <button
                    type="button"
                    onClick={handlePlayPauseToggle}
                    className={`mt-4 px-6 py-3 rounded-full text-button-primary border transition flex items-center justify-center mx-auto gap-2 ${
                      isFeedPaused 
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                        : 'border-slate-700 text-slate-200 hover:border-indigo-400 hover:text-indigo-200'
                    }`}
                    aria-label={isFeedPaused ? (showStarted ? 'Resume' : 'Start Show') : t('controls.pause')}
                  >
                    {isFeedPaused ? (
                      <>
                        <Play className="w-4 h-4" />
                        <span>{showStarted ? 'Resume' : 'Start Show'}</span>
                      </>
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className={`transition-all duration-700 ${isLive ? 'opacity-100 scale-100' : 'opacity-30 scale-95 pointer-events-none'}`}>
                <GuestCard
                  guest={selectedGuests[1]}
                  state={geminiSessions.sessions[selectedGuests[1].id]}
                  analyserNode={audio.analyserNodes[selectedGuests[1].id]}
                  isAwaitingAudio={conversation.state.awaitingAudio[selectedGuests[1].id]}
                />
              </div>
            </main>

            <footer className="hidden md:block w-full max-w-5xl mt-12 group relative z-10">
              <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/5 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)]">
                <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center gap-3 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-label-secondary">Global Discussion Log</span>
                  </div>
                  {isLive && (
                    <DebateStatus
                      turnIndex={conversation.state.turnIndex}
                      targetTurns={conversation.state.targetTurns}
                      paused={isFeedPaused}
                    />
                  )}
                </div>
                <div className="px-6 py-4 border-b border-white/5 bg-slate-900/60">
                  <div className="flex items-center gap-3">
                    <span className="text-label-secondary">{t('footer.hostInput.title')}</span>
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
                      className="flex-1 rounded-full bg-slate-950/60 border border-slate-700 px-4 py-2 text-body-small text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                      disabled={!isLive}
                    />
                    <button
                      onClick={sendHostMessage}
                      disabled={!isLive || !hostInput.trim()}
                      className="px-4 py-2 rounded-full text-button-secondary bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500"
                    >
                      {t('footer.hostInput.send')}
                    </button>
                  </div>
                </div>
                <TranscriptionFeed entries={transcription.transcriptions} guests={selectedGuests} />
              </div>
            </footer>
          </>
        )}

        <div className="fixed inset-0 -z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[180px] rounded-full" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/5 blur-[180px] rounded-full" />
        </div>
        <audio ref={laughAudioRef} src="/laughter-short.mp3" preload="auto" />

        {/* Footer — hidden on mobile during a live show (sticky control bar replaces it) */}
        <div className={isLive ? 'hidden md:block' : 'contents'}>
          <Footer />
        </div>
      </div>
    </>
  );
};

export default App;
