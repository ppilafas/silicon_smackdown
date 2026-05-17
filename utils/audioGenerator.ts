/**
 * Audio Generation System
 * Converts debate scripts to audio using Gemini TTS with laugh injection
 */

import { GoogleGenAI } from '@google/genai';
import { DebateTurn, GeneratedDebate } from './debateGenerator';
import { GuestProfile } from '../types';

export interface AudioSegment {
  type: 'speech' | 'laugh';
  audioData?: string; // base64 encoded audio
  duration?: number;
}

export interface GeneratedAudio {
  turnNumber: number;
  speaker: string;
  segments: AudioSegment[];
  totalDuration: number;
}

/**
 * Generate audio for a single debate turn with laugh injection
 */
export async function generateTurnAudio(
  turn: DebateTurn,
  guest: GuestProfile,
  apiKey: string,
  laughAudioBase64?: string
): Promise<GeneratedAudio> {
  const ai = new GoogleGenAI({ apiKey });

  console.log(`\n[AudioGenerator] 🎙️ Generating audio for Turn ${turn.turnNumber} (${turn.speaker})`);

  // Split text at [LAUGH] tags
  const segments = splitTextWithLaughs(turn.text);
  console.log(`[AudioGenerator] Found ${segments.filter(s => s.type === 'laugh').length} laugh points`);

  const audioSegments: AudioSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (segment.type === 'laugh') {
      // Inject laugh audio
      if (laughAudioBase64) {
        audioSegments.push({
          type: 'laugh',
          audioData: laughAudioBase64,
          duration: 1.5, // Assume ~1.5 seconds for laugh
        });
        console.log(`[AudioGenerator] 😂 Injected laugh #${audioSegments.filter(s => s.type === 'laugh').length}`);
      }
    } else {
      // Generate TTS for speech segment
      const speechAudio = await generateSpeechSegment(
        segment.text,
        guest,
        ai
      );
      audioSegments.push({
        type: 'speech',
        audioData: speechAudio,
        duration: estimateDuration(segment.text),
      });
      console.log(`[AudioGenerator] 🗣️ Generated speech segment (${segment.text.length} chars)`);
    }
  }

  const totalDuration = audioSegments.reduce((sum, seg) => sum + (seg.duration || 0), 0);

  console.log(`[AudioGenerator] ✅ Turn complete: ${audioSegments.length} segments, ${totalDuration.toFixed(1)}s total\n`);

  return {
    turnNumber: turn.turnNumber,
    speaker: turn.speaker,
    segments: audioSegments,
    totalDuration,
  };
}

/**
 * Generate audio for entire debate
 */
export async function generateDebateAudio(
  debate: GeneratedDebate,
  guests: GuestProfile[],
  apiKey: string,
  laughAudioBase64?: string,
  onProgress?: (current: number, total: number) => void
): Promise<GeneratedAudio[]> {
  console.log('\n========================================');
  console.log('[AudioGenerator] 🎬 Starting full debate audio generation');
  console.log(`[AudioGenerator] ${debate.turns.length} turns to process`);
  console.log('========================================\n');

  const audioTurns: GeneratedAudio[] = [];

  for (let i = 0; i < debate.turns.length; i++) {
    const turn = debate.turns[i];
    const guest = guests.find(g => g.name === turn.speaker);

    if (!guest) {
      console.warn(`[AudioGenerator] ⚠️ Guest not found for ${turn.speaker}, skipping`);
      continue;
    }

    onProgress?.(i + 1, debate.turns.length);

    const audio = await generateTurnAudio(turn, guest, apiKey, laughAudioBase64);
    audioTurns.push(audio);
  }

  const totalDuration = audioTurns.reduce((sum, turn) => sum + turn.totalDuration, 0);
  console.log('\n========================================');
  console.log('[AudioGenerator] ✅ Full debate audio complete');
  console.log(`[AudioGenerator] Total duration: ${(totalDuration / 60).toFixed(2)} minutes`);
  console.log('========================================\n');

  return audioTurns;
}

/**
 * Generate TTS for a single speech segment
 */
async function generateSpeechSegment(
  text: string,
  guest: GuestProfile,
  ai: GoogleGenAI
): Promise<string> {
  // Build style prompt based on guest personality
  const stylePrompt = buildStylePrompt(guest, text);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: stylePrompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: guest.voice,
            },
          },
        },
      },
    });

    // Extract base64 audio from response
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return audioData || '';
  } catch (error) {
    console.error('[AudioGenerator] TTS generation failed:', error);
    throw error;
  }
}

/**
 * Build style prompt for TTS based on guest personality
 */
function buildStylePrompt(guest: GuestProfile, text: string): string {
  // Extract personality traits for style guidance
  const personalityMap: Record<string, string> = {
    'George W. Bush': 'folksy, confused, slightly defensive, with a Texas drawl',
    'The Bush': 'slow, wise, philosophical, with a calm and measured tone',
  };

  const style = personalityMap[guest.name] || guest.personality;

  return `Style: ${style}

Text: ${text}`;
}

/**
 * Split text at [LAUGH] tags into speech and laugh segments
 */
function splitTextWithLaughs(text: string): Array<{ type: 'speech' | 'laugh'; text: string }> {
  const segments: Array<{ type: 'speech' | 'laugh'; text: string }> = [];
  const parts = text.split('[LAUGH]');

  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (trimmed) {
      segments.push({ type: 'speech', text: trimmed });
    }
    // Add laugh after each part except the last
    if (i < parts.length - 1) {
      segments.push({ type: 'laugh', text: '' });
    }
  }

  return segments;
}

/**
 * Estimate audio duration from text length
 * Average speaking rate: ~150 words per minute
 */
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 150 / 60; // ~2.5 words/second
  return words / wordsPerSecond;
}

/**
 * Load laugh audio file as base64
 */
export async function loadLaughAudio(audioPath: string = '/laugh.mp3'): Promise<string> {
  try {
    const response = await fetch(audioPath);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[AudioGenerator] Failed to load laugh audio:', error);
    return '';
  }
}
