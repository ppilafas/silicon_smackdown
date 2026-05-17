import React, { useState, useEffect } from 'react';
import { RIVALRIES } from '../constants';
import { generateDebateScript, GeneratedDebate } from '../utils/debateGenerator';
import { generateDebateAudio, loadLaughAudio, GeneratedAudio } from '../utils/audioGenerator';

const STORAGE_KEY_DEBATE = 'debate_test_script';
const STORAGE_KEY_AUDIO = 'debate_test_audio';

export const DebateTest: React.FC = () => {
  const [selectedRivalryId, setSelectedRivalryId] = useState<string>('bush-vs-bush-rivalry');
  const [numTurns, setNumTurns] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDebate, setGeneratedDebate] = useState<GeneratedDebate | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Audio generation state
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState<{ current: number; total: number } | null>(null);
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingTurn, setCurrentPlayingTurn] = useState<number | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedDebate = localStorage.getItem(STORAGE_KEY_DEBATE);
      const savedAudio = localStorage.getItem(STORAGE_KEY_AUDIO);
      
      if (savedDebate) {
        const debate = JSON.parse(savedDebate);
        setGeneratedDebate(debate);
        console.log('[DebateTest] Loaded debate from localStorage:', debate.turns.length, 'turns');
      }
      
      if (savedAudio) {
        const audio = JSON.parse(savedAudio);
        setGeneratedAudio(audio);
        console.log('[DebateTest] Loaded audio from localStorage:', audio.length, 'turns');
      }
    } catch (err) {
      console.error('[DebateTest] Failed to load from localStorage:', err);
    }
  }, []);

  // Save to localStorage when debate changes
  useEffect(() => {
    if (generatedDebate) {
      try {
        localStorage.setItem(STORAGE_KEY_DEBATE, JSON.stringify(generatedDebate));
        console.log('[DebateTest] Saved debate to localStorage');
      } catch (err) {
        console.error('[DebateTest] Failed to save debate to localStorage:', err);
      }
    }
  }, [generatedDebate]);

  // Save to localStorage when audio changes
  useEffect(() => {
    if (generatedAudio) {
      try {
        localStorage.setItem(STORAGE_KEY_AUDIO, JSON.stringify(generatedAudio));
        console.log('[DebateTest] Saved audio to localStorage');
      } catch (err) {
        console.error('[DebateTest] Failed to save audio to localStorage:', err);
      }
    }
  }, [generatedAudio]);

  const handleGenerate = async () => {
    const rivalry = RIVALRIES.find(r => r.id === selectedRivalryId);
    if (!rivalry) {
      setError('Rivalry not found');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedDebate(null);
    setGeneratedAudio(null);

    try {
      console.log('[DebateTest] Starting generation...');
      const debate = await generateDebateScript(rivalry, numTurns, 'en');
      setGeneratedDebate(debate);
      console.log('[DebateTest] Generation complete!', debate);
    } catch (err: any) {
      console.error('[DebateTest] Generation failed:', err);
      setError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!generatedDebate) {
      setError('Generate debate script first');
      return;
    }

    const rivalry = RIVALRIES.find(r => r.id === selectedRivalryId);
    if (!rivalry) return;

    setIsGeneratingAudio(true);
    setError(null);
    setAudioProgress(null);

    try {
      console.log('[DebateTest] Loading laugh audio...');
      const laughAudio = await loadLaughAudio('/laugh.mp3');
      
      console.log('[DebateTest] Starting audio generation...');
      const audio = await generateDebateAudio(
        generatedDebate,
        rivalry.guests,
        laughAudio,
        (current, total) => {
          setAudioProgress({ current, total });
        }
      );
      
      setGeneratedAudio(audio);
      console.log('[DebateTest] Audio generation complete!', audio);
    } catch (err: any) {
      console.error('[DebateTest] Audio generation failed:', err);
      setError(err.message || 'Audio generation failed');
    } finally {
      setIsGeneratingAudio(false);
      setAudioProgress(null);
    }
  };

  const playAudioTurn = async (audioTurn: GeneratedAudio, onComplete?: () => void) => {
    try {
      console.log(`[DebateTest] Playing Turn ${audioTurn.turnNumber} (${audioTurn.speaker})`);
      setCurrentPlayingTurn(audioTurn.turnNumber);
      
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Process each segment sequentially
      let currentTime = audioContext.currentTime;
      const sources: AudioBufferSourceNode[] = [];
      
      for (const segment of audioTurn.segments) {
        if (segment.audioData) {
          // Convert base64 to ArrayBuffer
          const binaryString = atob(segment.audioData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          try {
            // Decode audio data
            const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
            
            // Create source
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            
            // Schedule playback
            source.start(currentTime);
            currentTime += audioBuffer.duration;
            sources.push(source);
            
            console.log(`[DebateTest] Scheduled ${segment.type} segment (${audioBuffer.duration.toFixed(2)}s)`);
          } catch (decodeError) {
            console.error('[DebateTest] Failed to decode audio segment:', decodeError);
          }
        }
      }
      
      if (sources.length === 0) {
        throw new Error('No audio segments could be decoded');
      }
      
      console.log(`[DebateTest] Playing ${sources.length} segments (${(currentTime - audioContext.currentTime).toFixed(1)}s total)`);
      
      // Set up completion handler on last source
      const lastSource = sources[sources.length - 1];
      lastSource.onended = () => {
        setCurrentPlayingTurn(null);
        console.log('[DebateTest] Playback complete');
        audioContext.close();
        onComplete?.();
      };
      
    } catch (err) {
      console.error('[DebateTest] Audio playback failed:', err);
      setError(`Audio playback failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setCurrentPlayingTurn(null);
      setIsPlaying(false);
    }
  };

  const playAllTurns = async () => {
    if (!generatedAudio || generatedAudio.length === 0) return;
    
    setIsPlaying(true);
    console.log('[DebateTest] Starting full debate playback');
    
    const playNext = async (index: number) => {
      if (index >= generatedAudio.length) {
        setIsPlaying(false);
        console.log('[DebateTest] Full debate playback complete');
        return;
      }
      
      await playAudioTurn(generatedAudio[index], () => {
        // Play next turn after 1 second pause
        setTimeout(() => playNext(index + 1), 1000);
      });
    };
    
    playNext(0);
  };

  const clearCache = () => {
    localStorage.removeItem(STORAGE_KEY_DEBATE);
    localStorage.removeItem(STORAGE_KEY_AUDIO);
    setGeneratedDebate(null);
    setGeneratedAudio(null);
    console.log('[DebateTest] Cleared cache');
  };

  const selectedRivalry = RIVALRIES.find(r => r.id === selectedRivalryId);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-heading-primary mb-2">🧪 Debate Pre-Generation Test Lab</h1>
            <p className="text-body-base text-slate-400">
              Test the debate script generation system without affecting the live app
            </p>
          </div>
          {(generatedDebate || generatedAudio) && (
            <button
              onClick={clearCache}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Clear Cache
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 mb-8">
          <h2 className="text-heading-secondary mb-4">Generation Settings</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rivalry Selector */}
            <div>
              <label className="block text-label mb-2">Select Rivalry</label>
              <select
                value={selectedRivalryId}
                onChange={(e) => setSelectedRivalryId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-body-base focus:outline-none focus:border-indigo-500"
              >
                {RIVALRIES.map(rivalry => (
                  <option key={rivalry.id} value={rivalry.id}>
                    {rivalry.name}
                  </option>
                ))}
              </select>
              {selectedRivalry && (
                <p className="text-body-small text-slate-400 mt-2">
                  {selectedRivalry.description}
                </p>
              )}
            </div>

            {/* Turn Count */}
            <div>
              <label className="block text-label mb-2">Number of Turns</label>
              <input
                type="number"
                min="2"
                max="20"
                value={numTurns}
                onChange={(e) => setNumTurns(parseInt(e.target.value) || 10)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-body-base focus:outline-none focus:border-indigo-500"
              />
              <p className="text-body-small text-slate-400 mt-2">
                {Math.ceil(numTurns / 2)} turns per guest
              </p>
            </div>
          </div>

          {/* Generate Buttons */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isGeneratingAudio}
              className={`flex-1 px-8 py-3 rounded-full text-button-primary transition-all ${
                isGenerating || isGeneratingAudio
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Generating Script...
                </span>
              ) : (
                '🎬 Generate Script'
              )}
            </button>

            {generatedDebate && (
              <button
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio || isGenerating}
                className={`flex-1 px-8 py-3 rounded-full text-button-primary transition-all ${
                  isGeneratingAudio || isGenerating
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20'
                }`}
              >
                {isGeneratingAudio ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    {audioProgress 
                      ? `Generating Audio... (${audioProgress.current}/${audioProgress.total})`
                      : 'Generating Audio...'
                    }
                  </span>
                ) : (
                  '🎙️ Generate Audio'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 mb-8">
            <h3 className="text-heading-tertiary text-red-400 mb-2">❌ Generation Error</h3>
            <p className="text-body-base text-red-300">{error}</p>
          </div>
        )}

        {/* Generated Audio Display */}
        {generatedAudio && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-heading-secondary">🎙️ Generated Audio</h2>
                <button
                  onClick={playAllTurns}
                  disabled={isPlaying}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    isPlaying
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Playing...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Play All
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-4 text-body-small text-emerald-400">
                <span>🎵 {generatedAudio.length} audio turns</span>
                <span>⏱️ {(generatedAudio.reduce((sum, a) => sum + a.totalDuration, 0) / 60).toFixed(2)} minutes</span>
              </div>
            </div>

            {/* Audio Players */}
            <div className="space-y-4">
              {generatedAudio.map((audioTurn, index) => {
                const guest = selectedRivalry?.guests.find(g => g.name === audioTurn.speaker);
                const isEven = index % 2 === 0;
                
                const isCurrentlyPlaying = currentPlayingTurn === audioTurn.turnNumber;
                
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrentlyPlaying
                        ? 'bg-emerald-500/20 border-emerald-400 ring-2 ring-emerald-500/50'
                        : isEven
                        ? 'bg-indigo-500/5 border-indigo-500/20'
                        : 'bg-emerald-500/5 border-emerald-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full ${guest?.avatarColor || 'bg-slate-700'} flex items-center justify-center text-lg font-bold ${
                        isCurrentlyPlaying ? 'ring-2 ring-emerald-400 scale-110' : ''
                      } transition-all`}>
                        {audioTurn.speaker[0]}
                      </div>

                      {/* Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`text-body-base font-bold ${isCurrentlyPlaying ? 'text-emerald-400' : ''}`}>
                            {audioTurn.speaker}
                          </h3>
                          <span className="text-mono-small text-slate-500">Turn {audioTurn.turnNumber}</span>
                          {isCurrentlyPlaying && (
                            <span className="text-body-small text-emerald-400 animate-pulse">● Playing</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-body-small text-slate-400">
                          <span>🎬 {audioTurn.segments.length} segments</span>
                          <span>😂 {audioTurn.segments.filter(s => s.type === 'laugh').length} laughs</span>
                          <span>⏱️ {audioTurn.totalDuration.toFixed(1)}s</span>
                        </div>
                      </div>

                      {/* Play Button */}
                      <button
                        onClick={() => playAudioTurn(audioTurn)}
                        disabled={isPlaying}
                        className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                          isPlaying
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Play
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Generated Debate Display */}
        {generatedDebate && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-heading-secondary">📜 Generated Script</h2>
              <div className="flex items-center gap-4 text-body-small text-slate-400">
                <span>🎭 {generatedDebate.turns.length} turns</span>
                {generatedDebate.totalTokens && (
                  <span>🔢 {generatedDebate.totalTokens} tokens</span>
                )}
                <span>⏱️ {new Date(generatedDebate.generatedAt).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Turns */}
            <div className="space-y-4">
              {generatedDebate.turns.map((turn, index) => {
                const guest = selectedRivalry?.guests.find(g => g.name === turn.speaker);
                const isEven = index % 2 === 0;
                
                return (
                  <div
                    key={index}
                    className={`p-6 rounded-xl border transition-all ${
                      isEven
                        ? 'bg-indigo-500/5 border-indigo-500/20'
                        : 'bg-emerald-500/5 border-emerald-500/20'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full ${guest?.avatarColor || 'bg-slate-700'} flex items-center justify-center text-xl font-bold`}>
                        {turn.speaker[0]}
                      </div>

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-heading-tertiary">{turn.speaker}</h3>
                          <span className="text-mono-small text-slate-500">
                            Turn {turn.turnNumber}
                          </span>
                          {guest && (
                            <span className="text-body-small text-slate-400">
                              • {guest.role}
                            </span>
                          )}
                        </div>
                        <p className="text-body-base leading-relaxed whitespace-pre-wrap">
                          {turn.text}
                        </p>
                        
                        {/* Laugh count */}
                        {turn.text.includes('[LAUGH]') && (
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-body-small text-amber-400">
                              😂 {(turn.text.match(/\[LAUGH\]/g) || []).length} laugh{(turn.text.match(/\[LAUGH\]/g) || []).length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stats */}
            <div className="mt-6 pt-6 border-t border-slate-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-mono-small text-slate-500">Total Turns</div>
                  <div className="text-heading-tertiary">{generatedDebate.turns.length}</div>
                </div>
                <div>
                  <div className="text-mono-small text-slate-500">Total Laughs</div>
                  <div className="text-heading-tertiary">
                    {generatedDebate.turns.reduce((acc, turn) => 
                      acc + (turn.text.match(/\[LAUGH\]/g) || []).length, 0
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-mono-small text-slate-500">Avg Words/Turn</div>
                  <div className="text-heading-tertiary">
                    {Math.round(
                      generatedDebate.turns.reduce((acc, turn) => 
                        acc + turn.text.split(/\s+/).length, 0
                      ) / generatedDebate.turns.length
                    )}
                  </div>
                </div>
                {generatedDebate.totalTokens && (
                  <div>
                    <div className="text-mono-small text-slate-500">Est. Cost</div>
                    <div className="text-heading-tertiary text-green-400">
                      ${((generatedDebate.totalTokens / 1000000) * 0.15).toFixed(4)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
