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
import { LiveApiIndicator } from './components/LiveApiIndicator';
import { SplashScreen } from './components/SplashScreen';
import {
  useConversationState,
  useTranscription,
  useAudioPipeline,
  useGeminiSessions,
} from './hooks';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  
  // UI State
  const [showSplash, setShowSplash] = useState(true);
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(() =>
    localStorage.getItem('smackdown_password_unlocked') === 'true'
  );
  const expectedPassword = import.meta.env.VITE_LANDING_PASSWORD as string | undefined;
  const [isLive, setIsLive] = useState(false);
  const [selectedRivalryId, setSelectedRivalryId] = useState<string | null>(null);
  const [selectedGuests, setSelectedGuests] = useState<GuestProfile[]>([]);
  const [isFeedPaused, setIsFeedPaused] = useState(false);
  const [showStarted, setShowStarted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [apiStatus, setApiStatus] = useState<ConnectionStatus>('disconnected');
  const [hostInput, setHostInput] = useState('');

  // Refs for synchronous access in callbacks
  const isMicMutedRef = useRef(false);
  const isFeedPausedRef = useRef(false);
  const lastLanguageRef = useRef(i18n.language);
  const laughAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastLaughterAtRef = useRef(0);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom hooks
  const conversation = useConversationState(selectedGuests[0]?.id);
  const transcription = useTranscription();
  const audio = useAudioPipeline();

  // Session message handler
  const handleSessionMessage = useCallback((guestId: string, message: LiveServerMessage) => {
    const speakerName = selectedGuests.find(g => g.id === guestId)?.name || 'Guest';
    const convState = conversation.stateRef.current;

    // Only process messages from the active guest
    if (guestId !== convState.activeGuestId) {
      if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
          message.serverContent?.turnComplete) {
        return; // Silently ignore non-active guest
      }
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
        conversation.actions.setActiveGuest(otherGuest.id);

        // Build prompt for next guest
        const hostContext = convState.lastHostInstruction 
          ? `[Host said]: "${convState.lastHostInstruction}"\n\n` 
          : '';
        const guestContext = spokenText.trim() 
          ? `[${speakerName} said]: "${spokenText.trim()}"\n\n` 
          : '';
        const prompt = `${hostContext}${guestContext}Now it's your turn, ${otherGuest.name}. Respond naturally. Keep it under 25 seconds.`;

        if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
        console.log(`[App] Prompting ${otherGuest.name} immediately`);
        
        conversation.actions.setAwaitingAudio(otherGuest.id, true);
        geminiSessions.sendToGuest(otherGuest.id, { text: prompt });

        // Clear host instruction after use
        if (convState.lastHostInstruction) {
          setTimeout(() => conversation.actions.clearHostInstruction(), 5000);
        }
      }
    }

    // Handle audio output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      conversation.actions.setAwaitingAudio(guestId, false);
      
      // Mark that active guest is now speaking
      if (!convState.isGuestSpeaking) {
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
  }, [selectedGuests, conversation, transcription, audio]);

  // Gemini sessions hook
  const geminiSessions = useGeminiSessions({
    apiKey: import.meta.env.VITE_API_KEY,
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
  const handleLanguageChange = (language: string) => {
    i18n.changeLanguage(language);
    localStorage.setItem('language', language);
  };

  const handleUnlock = () => {
    setIsPasswordUnlocked(true);
    localStorage.setItem('smackdown_password_unlocked', 'true');
  };

  const handleRivalrySelect = (rivalry: RivalryPair) => {
    if (isLive) return;
    setSelectedRivalryId(rivalry.id);
    setSelectedGuests(rivalry.guests);
    conversation.actions.reset(rivalry.guests[0].id);
  };

  const toggleMicMute = () => {
    const newMuteState = !isMicMuted;
    setIsMicMuted(newMuteState);
    isMicMutedRef.current = newMuteState;
    console.log(`[App] Mic ${newMuteState ? 'MUTED' : 'UNMUTED'}`);
  };

  const sendHostMessage = useCallback(() => {
    const message = hostInput.trim();
    if (!message || !isLive) return;

    transcription.addTranscription('Moderator', message, 'user');
    conversation.actions.hostSentMessage(message);
    setHostInput('');

    const convState = conversation.stateRef.current;
    const activeGuestId = convState.activeGuestId ?? selectedGuests[0]?.id;
    
    if (activeGuestId && !convState.isGuestSpeaking) {
      geminiSessions.sendToGuest(activeGuestId, { text: `[Host said]: "${message}"` });
    }
  }, [hostInput, isLive, selectedGuests, transcription, conversation, geminiSessions]);

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
  const startShow = async () => {
    setIsLive(true);
    setIsMicMuted(true); // Start with mic muted
    isMicMutedRef.current = true;
    setIsFeedPaused(true); // Start paused
    isFeedPausedRef.current = true;
    setShowStarted(false); // Reset show started flag
    transcription.clearTranscriptions();

    // Initialize audio pipeline
    await audio.initialize();

    // Initialize audio for each guest
    selectedGuests.forEach(guest => {
      audio.initializeGuestAudio(guest.id);
    });

    // Connect guests
    await geminiSessions.connectGuests(selectedGuests);

    // Reset conversation state
    conversation.actions.reset(selectedGuests[0].id);

    console.log(`[App] Show started - Active Guest: ${selectedGuests[0].name} (Paused, waiting for user to start)`);

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
  };

  // Stop the show
  const stopShow = () => {
    setIsLive(false);
    setShowStarted(false);
    setIsFeedPaused(false);

    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }

    geminiSessions.disconnectAll();
    audio.cleanup();
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

      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-4 md:p-8 overflow-x-hidden relative pt-24 md:pt-28">
        <header className="fixed top-0 inset-x-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
          <div className="w-full max-w-6xl mx-auto flex justify-between items-center px-4 md:px-8 py-4">
            <div className="flex items-center gap-3">
              <img 
                src="/big_hero_logo.png" 
                alt="Silicon Smackdown" 
                className="h-8 md:h-10 w-auto object-contain"
              />
              <div className="flex flex-col">
                <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-white uppercase italic">
                  Silicon Smackdown
                </h1>
                <p className="text-slate-400 text-[10px] uppercase tracking-[0.3em] mono">{t('header.version')}</p>
              </div>
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
                <LiveApiIndicator status={apiStatus} sessions={geminiSessions.sessions} totalGuests={selectedGuests.length} />
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
                    onClick={() => {
                      if (isFeedPaused && !showStarted) {
                        // First time starting - unpause and trigger first guest to start roasting
                        setIsFeedPaused(false);
                        isFeedPausedRef.current = false;
                        setShowStarted(true);
                        
                        // Send prompt to first guest to start the roast battle
                        const firstGuest = selectedGuests[0];
                        if (firstGuest) {
                          const startPrompt = `Welcome to Silicon Smackdown! You're ${firstGuest.name}, and your rival ${selectedGuests[1]?.name} is here. Start the show with a bold opening statement or roast. Make it punchy and entertaining! Keep it under 20 seconds.`;
                          geminiSessions.sendToGuest(firstGuest.id, { text: startPrompt });
                          console.log(`[App] Show started! Sent opening prompt to ${firstGuest.name}`);
                        }
                      } else if (isFeedPaused && showStarted) {
                        // Resume after pause - just unpause without sending new prompt
                        setIsFeedPaused(false);
                        isFeedPausedRef.current = false;
                        console.log(`[App] Show resumed - conversation continues`);
                      } else {
                        // Pause the show
                        setIsFeedPaused(true);
                        isFeedPausedRef.current = true;
                        console.log(`[App] Show paused`);
                      }
                    }}
                    className={`mt-4 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest border transition flex items-center justify-center mx-auto gap-2 ${
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
                <TranscriptionFeed entries={transcription.transcriptions} />
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
