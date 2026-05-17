/**
 * Mints a short-lived, single-use ephemeral auth token for the Gemini Live API.
 *
 * The real GEMINI_API_KEY lives only in this server environment and is never
 * sent to the browser. The client connects to the Live API directly using the
 * returned token, so we keep the low-latency direct WebSocket while keeping the
 * key secret.
 *
 * NOTE: we intentionally do NOT set `liveConnectConstraints`. Setting it (even
 * with only a model) locks the ENTIRE LiveConnectConfig to what's in the
 * constraint, so the browser's per-guest responseModalities/speechConfig get
 * ignored and the session is closed with WS 1007 ("Cannot extract voices from
 * a non-audio request"). Each guest needs a different voice/systemInstruction,
 * so the config must stay client-supplied. Security is enforced instead by
 * single-use + short expiry, which makes a leaked token near-worthless.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/token] GEMINI_API_KEY is not set');
    res.status(500).json({ error: 'Server is not configured' });
    return;
  }

  try {
    // Ephemeral tokens are only supported on the v1alpha API surface.
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        // One new Live session per token.
        uses: 1,
        // Session messages rejected ~30 min after mint (client auto-reconnects
        // with a fresh token, so long shows still work).
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        // The token must be used to start a session within 2 minutes.
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    if (!token.name) {
      throw new Error('Token response missing name');
    }

    // Do not cache an auth token.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ token: token.name });
  } catch (err: any) {
    console.error('[api/token] Failed to mint ephemeral token:', err?.message || err);
    res.status(502).json({ error: 'Failed to mint token' });
  }
}
