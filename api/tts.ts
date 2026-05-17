/**
 * Server-side proxy for single-segment TTS generation.
 *
 * Keeps the API key off the client. Model and response modality are fixed;
 * the caller only chooses the prebuilt voice and supplies the styled text.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MAX_TEXT_CHARS = 8000;
const VOICE_PATTERN = /^[A-Za-z]{1,40}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/tts] GEMINI_API_KEY is not set');
    res.status(500).json({ error: 'Server is not configured' });
    return;
  }

  const body = (req.body || {}) as { text?: unknown; voiceName?: unknown };
  const text = body.text;
  const voiceName = body.voiceName;

  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_CHARS) {
    res.status(400).json({ error: 'Invalid text' });
    return;
  }
  if (typeof voiceName !== 'string' || !VOICE_PATTERN.test(voiceName)) {
    res.status(400).json({ error: 'Invalid voiceName' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? '';
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ audioData });
  } catch (err: any) {
    console.error('[api/tts] TTS generation failed:', err?.message || err);
    res.status(502).json({ error: 'TTS generation failed' });
  }
}
