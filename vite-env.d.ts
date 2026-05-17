/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The Gemini API key is NOT a client env var — it stays server-side.
  readonly VITE_LANDING_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
