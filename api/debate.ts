/**
 * Server-side proxy for debate-script generation.
 *
 * Ephemeral tokens only cover the Live API, so plain generateContent calls
 * must be proxied to keep the key off the client. The model, generation
 * config and response schema are fixed here so this endpoint can only be used
 * for its intended purpose.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MAX_PROMPT_CHARS = 24000;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    turns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string' },
          turnNumber: { type: 'number' },
        },
        required: ['speaker', 'text', 'turnNumber'],
      },
    },
  },
  required: ['turns'],
} as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/debate] GEMINI_API_KEY is not set');
    res.status(500).json({ error: 'Server is not configured' });
    return;
  }

  const prompt = (req.body as { prompt?: unknown })?.prompt;
  if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > MAX_PROMPT_CHARS) {
    res.status(400).json({ error: 'Invalid prompt' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.9,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as any,
      },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      text: response.text ?? '',
      totalTokens: response.usageMetadata?.totalTokenCount,
    });
  } catch (err: any) {
    console.error('[api/debate] Generation failed:', err?.message || err);
    res.status(502).json({ error: 'Generation failed' });
  }
}
