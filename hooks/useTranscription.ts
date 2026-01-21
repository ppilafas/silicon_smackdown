import { useState, useCallback, useRef } from 'react';
import { TranscriptionEntry } from '../types';

export function useTranscription() {
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  
  // Track streaming entry IDs per speaker for updates
  const streamingEntryIdRef = useRef<Record<string, string>>({});
  
  // Track accumulated text per guest for relay
  const accumulatedTextRef = useRef<Record<string, string>>({});

  // Add a complete transcription entry (non-streaming)
  const addTranscription = useCallback((
    speaker: string,
    text: string,
    type: 'user' | 'ai',
    isStreaming = false
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setTranscriptions(prev => {
      // Deduplicate: check if the last entry from this speaker has the same text
      const lastEntry = prev.length > 0 ? prev[prev.length - 1] : null;
      if (lastEntry && lastEntry.speaker === speaker && lastEntry.text === trimmed && !isStreaming) {
        return prev;
      }

      // Also check the second-to-last entry (in case of interleaved duplicates)
      const secondLastEntry = prev.length > 1 ? prev[prev.length - 2] : null;
      if (secondLastEntry && secondLastEntry.speaker === speaker && secondLastEntry.text === trimmed && !isStreaming) {
        return prev;
      }

      return [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          speaker,
          text: trimmed,
          timestamp: Date.now(),
          type,
          isStreaming,
        },
      ];
    });
  }, []);

  // Update or create a streaming transcription entry
  const updateStreamingTranscription = useCallback((
    speaker: string,
    text: string,
    type: 'user' | 'ai',
    speakerId: string
  ) => {
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
          {
            id: newId,
            speaker,
            text: trimmed,
            timestamp: Date.now(),
            type,
            isStreaming: true,
          },
        ];
      }
    });
  }, []);

  // Finalize a streaming entry (mark as complete)
  const finalizeStreamingTranscription = useCallback((speakerId: string) => {
    const entryId = streamingEntryIdRef.current[speakerId];
    if (entryId) {
      setTranscriptions(prev =>
        prev.map(e => (e.id === entryId ? { ...e, isStreaming: false } : e))
      );
      delete streamingEntryIdRef.current[speakerId];
    }
  }, []);

  // Accumulate text for a speaker (used for relay)
  const accumulateText = useCallback((speakerId: string, text: string) => {
    accumulatedTextRef.current[speakerId] = 
      (accumulatedTextRef.current[speakerId] || '') + text;
  }, []);

  // Get accumulated text for a speaker
  const getAccumulatedText = useCallback((speakerId: string): string => {
    return accumulatedTextRef.current[speakerId] || '';
  }, []);

  // Clear accumulated text for a speaker
  const clearAccumulatedText = useCallback((speakerId: string) => {
    accumulatedTextRef.current[speakerId] = '';
  }, []);

  // Clear all transcriptions
  const clearTranscriptions = useCallback(() => {
    setTranscriptions([]);
    streamingEntryIdRef.current = {};
    accumulatedTextRef.current = {};
  }, []);

  return {
    transcriptions,
    addTranscription,
    updateStreamingTranscription,
    finalizeStreamingTranscription,
    accumulateText,
    getAccumulatedText,
    clearAccumulatedText,
    clearTranscriptions,
  };
}
