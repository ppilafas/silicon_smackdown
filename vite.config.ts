import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: the Gemini API key is intentionally NOT exposed to the client bundle.
// It lives only in the server env (GEMINI_API_KEY) and is used by the
// serverless functions in /api. The browser talks to /api/* instead.
export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
