/**
 * Dev-only: mirror browser console.{log,warn,error} to the `npm run dev`
 * terminal via POST /__log (handled by the clientLogBridge Vite plugin).
 * Batched + recursion-safe. Tree-shaken out of production builds because the
 * only caller wraps the import in `if (import.meta.env.DEV)`.
 */

type Level = 'log' | 'warn' | 'error';

const QUEUE: { level: Level; msg: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

// Capture the real fetch/console up front so our patched console can't
// recurse into itself via a logged fetch error.
const realFetch = window.fetch.bind(window);

function flush() {
  timer = null;
  if (QUEUE.length === 0) return;
  const lines = QUEUE.splice(0, QUEUE.length);
  try {
    realFetch('/__log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
      keepalive: true,
    }).catch(() => {
      /* dev bridge offline — ignore */
    });
  } catch {
    /* ignore */
  }
}

function enqueue(level: Level, args: unknown[]) {
  const msg = args
    .map(a => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  QUEUE.push({ level, msg });
  if (QUEUE.length > 300) QUEUE.shift();
  if (timer == null) timer = setTimeout(flush, 300);
}

export function installDevLogBridge() {
  if (!import.meta.env.DEV) return;
  (['log', 'warn', 'error'] as Level[]).forEach(level => {
    const orig = (console as any)[level].bind(console);
    (console as any)[level] = (...args: unknown[]) => {
      orig(...args);
      try {
        enqueue(level, args);
      } catch {
        /* never let logging break the app */
      }
    };
  });
  window.addEventListener('beforeunload', flush);
}
