'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  // This will help catch misconfiguration early in development.
  // In production you might want to handle this differently.
  // eslint-disable-next-line no-console
  console.warn('NEXT_PUBLIC_CONVEX_URL is not set. Convex will not work correctly.');
}

const convex = new ConvexReactClient(convexUrl ?? '');

export default function ConvexClientProvider({ children }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

