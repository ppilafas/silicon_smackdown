import { useRef, useCallback, useState } from 'react';
import { AUDIO_CONFIG } from '../constants';
import { createBlob, decode, decodeAudioData } from '../utils/audio-processing';

interface AudioPipelineOptions {
  onAudioData?: (data: { data: string; mimeType: string }) => void;
}

export function useAudioPipeline(options: AudioPipelineOptions = {}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [analyserNodes, setAnalyserNodes] = useState<Record<string, AnalyserNode | null>>({});

  // Audio contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  // Mic stream and worklet
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Analysers for visualization
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const guestAnalysersRef = useRef<Record<string, AnalyserNode>>({});

  // Audio playback tracking
  const nextStartTimeRef = useRef<Record<string, number>>({});
  const sourcesRef = useRef<Record<string, Set<AudioBufferSourceNode>>>({});

  // Callback refs for use in audio processing
  const onAudioDataRef = useRef(options.onAudioData);
  onAudioDataRef.current = options.onAudioData;

  // Initialize audio contexts and mic stream
  const initialize = useCallback(async () => {
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: AUDIO_CONFIG.inputSampleRate,
    });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: AUDIO_CONFIG.outputSampleRate,
    });

    inputAudioContextRef.current = inputCtx;
    outputAudioContextRef.current = outputCtx;

    if (inputCtx.state === 'suspended') await inputCtx.resume();
    if (outputCtx.state === 'suspended') await outputCtx.resume();

    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;

    // Create microphone analyser for visualization
    const micAnalyser = inputCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyserRef.current = micAnalyser;
    setAnalyserNodes(prev => ({ ...prev, mic: micAnalyser }));

    setIsInitialized(true);

    return { inputCtx, outputCtx, stream, micAnalyser };
  }, []);

  // Setup audio worklet for mic capture
  const setupMicCapture = useCallback(
    async (
      shouldSendAudio: () => boolean,
      getTargetSession: () => { sendRealtimeInput: (data: any) => void } | null
    ) => {
      const inputCtx = inputAudioContextRef.current;
      const stream = micStreamRef.current;
      const micAnalyser = micAnalyserRef.current;

      if (!inputCtx || !stream || !micAnalyser) {
        console.warn('[AudioPipeline] Not initialized');
        return;
      }

      const source = inputCtx.createMediaStreamSource(stream);

      try {
        // Try AudioWorklet first
        await inputCtx.audioWorklet.addModule('/audio-worklet-processor.js');
        const workletNode = new AudioWorkletNode(inputCtx, 'pcm-processor');
        workletNodeRef.current = workletNode;

        let lastMicLogTime = 0;
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audio') {
            if (!shouldSendAudio()) return;

            const session = getTargetSession();
            if (session) {
              const pcmBlob = createBlob(event.data.data);
              try {
                const now = Date.now();
                if (now - lastMicLogTime > 3000) {
                  console.log('[AudioPipeline] Sending mic audio');
                  lastMicLogTime = now;
                }
                session.sendRealtimeInput({ media: pcmBlob });
              } catch (e) {
                console.warn('[AudioPipeline] Failed to send audio:', e);
              }
            }
          }
        };

        source.connect(micAnalyser);
        source.connect(workletNode);
        workletNode.connect(inputCtx.destination);
      } catch (workletError) {
        // Fallback to ScriptProcessor
        console.warn('[AudioPipeline] AudioWorklet not supported, using ScriptProcessor:', workletError);
        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);

        let lastMicLogTimeFallback = 0;
        scriptProcessor.onaudioprocess = (e) => {
          if (!shouldSendAudio()) return;

          const session = getTargetSession();
          if (session) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            try {
              const now = Date.now();
              if (now - lastMicLogTimeFallback > 3000) {
                console.log('[AudioPipeline] Sending mic audio (fallback)');
                lastMicLogTimeFallback = now;
              }
              session.sendRealtimeInput({ media: pcmBlob });
            } catch (e) {
              console.warn('[AudioPipeline] Failed to send audio:', e);
            }
          }
        };

        source.connect(micAnalyser);
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputCtx.destination);
      }
    },
    []
  );

  // Play audio from a guest
  const playGuestAudio = useCallback(
    async (
      guestId: string,
      base64Audio: string,
      onSpeakingChange?: (isSpeaking: boolean) => void
    ) => {
      const ctx = outputAudioContextRef.current;
      if (!ctx) return;

      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        ctx,
        AUDIO_CONFIG.outputSampleRate,
        AUDIO_CONFIG.channels
      );

      const nextStart = Math.max(nextStartTimeRef.current[guestId] || 0, ctx.currentTime);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Get or create analyser for this guest
      let analyser = guestAnalysersRef.current[guestId];
      if (!analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(ctx.destination);
        guestAnalysersRef.current[guestId] = analyser;
        setAnalyserNodes(prev => ({ ...prev, [guestId]: analyser }));
      }
      source.connect(analyser);

      // Initialize sources set if needed
      if (!sourcesRef.current[guestId]) {
        sourcesRef.current[guestId] = new Set();
      }

      source.addEventListener('ended', () => {
        sourcesRef.current[guestId]?.delete(source);
        if (sourcesRef.current[guestId]?.size === 0) {
          onSpeakingChange?.(false);
        }
      });

      source.start(nextStart);
      nextStartTimeRef.current[guestId] = nextStart + audioBuffer.duration;
      sourcesRef.current[guestId]?.add(source);
      onSpeakingChange?.(true);
    },
    []
  );

  // Stop all audio for a guest (on interruption)
  const stopGuestAudio = useCallback((guestId: string) => {
    sourcesRef.current[guestId]?.forEach(s => s.stop());
    sourcesRef.current[guestId]?.clear();
    nextStartTimeRef.current[guestId] = 0;
  }, []);

  // Stop all audio for all guests
  const stopAllAudio = useCallback(() => {
    Object.keys(sourcesRef.current).forEach(guestId => {
      sourcesRef.current[guestId]?.forEach(source => source.stop());
      sourcesRef.current[guestId]?.clear();
      nextStartTimeRef.current[guestId] = 0;
    });
  }, []);

  // Initialize sources for a guest
  const initializeGuestAudio = useCallback((guestId: string) => {
    sourcesRef.current[guestId] = new Set();
    nextStartTimeRef.current[guestId] = 0;
  }, []);

  // Cleanup everything
  const cleanup = useCallback(() => {
    // Stop microphone
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;

    // Disconnect worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Stop all playing audio
    stopAllAudio();

    // Clean up analysers
    micAnalyserRef.current = null;
    guestAnalysersRef.current = {};
    setAnalyserNodes({});

    // Close AudioContexts
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;

    setIsInitialized(false);
  }, [stopAllAudio]);

  return {
    isInitialized,
    analyserNodes,
    initialize,
    setupMicCapture,
    playGuestAudio,
    stopGuestAudio,
    stopAllAudio,
    initializeGuestAudio,
    cleanup,
  };
}
