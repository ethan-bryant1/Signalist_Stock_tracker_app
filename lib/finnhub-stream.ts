import 'server-only';

import { FINNHUB_STREAM_URL, getFinnhubToken } from '@/lib/finnhub';
import { StreamHub, type SocketLike, type StreamCloseReason } from '@/lib/stream-hub';

// The server's one Finnhub trade stream, shared by every open heatmap (see lib/stream-hub.ts). Kept on globalThis so
// a code reload in development reuses it instead of opening a second socket, which Finnhub would refuse.
const holder = globalThis as { __loopsFinnhubHub?: StreamHub };

// The hub, or why there can't be one: no key, or a Node version without WebSocket (before 22)
export const finnhubStreamHub = (): StreamHub | StreamCloseReason => {
  const token = getFinnhubToken();
  if (!token) return 'not-configured';
  if (typeof WebSocket === 'undefined') return 'unsupported';
  // The URL carries the key, so it's never logged
  holder.__loopsFinnhubHub ??= new StreamHub({
    openSocket: () => new WebSocket(`${FINNHUB_STREAM_URL}?token=${encodeURIComponent(token)}`) as unknown as SocketLike,
  });
  return holder.__loopsFinnhubHub;
};
