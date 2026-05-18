import path from 'path';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: the Gemini API key is intentionally NOT exposed to the client bundle.
// It lives only in the server env (GEMINI_API_KEY) and is used by the
// serverless functions in /api. The browser talks to /api/* instead.
//
// Plain `vite` dev does NOT run Vercel functions, so the plugin below serves
// /api/* locally by invoking the same handlers (so `npm run dev` works without
// `vercel dev`). It only runs in dev — production uses real Vercel functions.
function vercelApiDev(env: Record<string, string>): Plugin {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Handlers read process.env; make the local key available to them.
      if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const name = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '');
        if (!name) return next();

        try {
          const mod = await server.ssrLoadModule(
            path.resolve(__dirname, `api/${name}.ts`)
          );
          const handler = mod.default;
          if (typeof handler !== 'function') return next();

          // Buffer the request body and expose it Vercel-style.
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: unknown;
          if (raw) {
            try { body = JSON.parse(raw); } catch { body = raw; }
          }
          (req as any).body = body;
          (req as any).query = Object.fromEntries(
            new URL(req.url, 'http://localhost').searchParams
          );

          // Minimal Vercel-like response shim over the Node res.
          const vres = res as any;
          vres.status = (code: number) => { res.statusCode = code; return vres; };
          vres.json = (obj: unknown) => {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(obj));
            return vres;
          };
          vres.send = (data: unknown) => {
            res.end(typeof data === 'string' ? data : JSON.stringify(data));
            return vres;
          };

          await handler(req, vres);
        } catch (e: any) {
          console.error(`[api-dev] /api/${name} failed:`, e?.message || e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'dev handler error' }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), vercelApiDev(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
