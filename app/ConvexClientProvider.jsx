'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  // This will help catch misconfiguration early in development.
  // In production you might want to handle this differently.
  // eslint-disable-next-line no-console
  console.warn('NEXT_PUBLIC_CONVEX_URL is not set. Convex will not work correctly.');
}

// Custom logger: suppress console.error for expected ConvexError application errors
// (e.g. "Play at least 2 card(s)"). The UI shows a friendly message instead.
const logListeners = {};
const gameFriendlyLogger = {
  _verbose: false,
  log(...args) {
    Object.values(logListeners).forEach((fn) => fn('info', ...args));
  },
  warn(...args) {
    Object.values(logListeners).forEach((fn) => fn('warn', ...args));
  },
  error(...args) {
    const msg = args.length > 0 && typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('ConvexError')) return;
    Object.values(logListeners).forEach((fn) => fn('error', ...args));
  },
  logVerbose(...args) {
    if (this._verbose) Object.values(logListeners).forEach((fn) => fn('debug', ...args));
  },
  addLogLineListener(fn) {
    const id = Math.random().toString(36).slice(2, 15);
    logListeners[id] = fn;
    return () => delete logListeners[id];
  },
};
// Wire up to console like Convex's default logger
gameFriendlyLogger.addLogLineListener((level, ...args) => {
  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else if (level === 'debug') console.debug(...args);
  else console.log(...args);
});

const convex = new ConvexReactClient(convexUrl ?? '', { logger: gameFriendlyLogger });

export default function ConvexClientProvider({ children }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

