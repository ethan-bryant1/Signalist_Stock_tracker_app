import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamHub, type SocketLike, type StreamListener } from '@/lib/stream-hub';

// Mon Oct 12 2026, 10:00 in New York: a regular-session trade time
const AT_10 = Date.UTC(2026, 9, 12, 14, 0);

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  trade(symbol: string, price: number, time = AT_10) {
    this.onmessage?.({ data: JSON.stringify({ type: 'trade', data: [{ s: symbol, p: price, t: time, v: 1 }] }) });
  }
}

const listener = () => {
  const events: { live: string[][]; trades: unknown[][]; closed: string[] } = { live: [], trades: [], closed: [] };
  const l: StreamListener = {
    onLive: (symbols) => events.live.push(symbols),
    onTrades: (trades) => events.trades.push(trades),
    onClosed: (reason) => events.closed.push(reason),
  };
  return { l, events };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT_10);
});
afterEach(() => vi.useRealTimers());

describe('StreamHub', () => {
  it('opens one socket for every listener and passes trades to all of them', () => {
    const sockets: FakeSocket[] = [];
    const hub = new StreamHub({ openSocket: () => (sockets.push(new FakeSocket()), sockets.at(-1)!) });
    const a = listener();
    const b = listener();
    hub.join(a.l, ['AAPL', 'MSFT']);
    hub.join(b.l, ['AAPL']);
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    expect(sockets[0].sent.map((m) => JSON.parse(m).symbol)).toEqual(['AAPL', 'MSFT']);
    expect(a.events.live).toEqual([['AAPL', 'MSFT']]);
    expect(b.events.live).toEqual([['AAPL', 'MSFT']]);

    sockets[0].trade('AAPL', 230);
    vi.advanceTimersByTime(500);
    expect(a.events.trades).toEqual([[{ symbol: 'AAPL', price: 230, time: AT_10, session: 'regular' }]]);
    expect(b.events.trades).toEqual(a.events.trades);
  });

  it('tells a listener that joins an open stream straight away, subscribing any new symbols', () => {
    const socket = new FakeSocket();
    const hub = new StreamHub({ openSocket: () => socket });
    hub.join(listener().l, ['AAPL']);
    socket.open();
    const late = listener();
    hub.join(late.l, ['NVDA']);
    expect(late.events.live).toEqual([['AAPL', 'NVDA']]);
    expect(socket.sent.map((m) => JSON.parse(m).symbol)).toEqual(['AAPL', 'NVDA']);
  });

  it('keeps the socket a little after the last listener leaves, then closes it', () => {
    const sockets: FakeSocket[] = [];
    const hub = new StreamHub({ openSocket: () => (sockets.push(new FakeSocket()), sockets.at(-1)!), lingerMs: 30_000 });
    const leave = hub.join(listener().l, ['AAPL']);
    sockets[0].open();
    leave();
    vi.advanceTimersByTime(10_000);
    // A reload rejoins within the linger time and reuses the socket
    const leaveAgain = hub.join(listener().l, ['AAPL']);
    expect(sockets).toHaveLength(1);
    leaveAgain();
    vi.advanceTimersByTime(30_000);
    expect(sockets[0].closed).toBe(true);
    expect(hub.streaming).toBe(false);
  });

  it('closes every listener when Finnhub refuses, and turns new ones away for a minute instead of retrying', () => {
    const sockets: FakeSocket[] = [];
    const hub = new StreamHub({ openSocket: () => (sockets.push(new FakeSocket()), sockets.at(-1)!), refusedForMs: 60_000 });
    const a = listener();
    hub.join(a.l, ['AAPL']);
    sockets[0].onclose?.({});
    expect(a.events.closed).toEqual(['refused']);
    const b = listener();
    hub.join(b.l, ['AAPL']);
    expect(b.events.closed).toEqual(['refused']);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(60_001);
    hub.join(listener().l, ['AAPL']);
    expect(sockets).toHaveLength(2);
  });

  it('reports a drop after the stream was open', () => {
    const socket = new FakeSocket();
    const hub = new StreamHub({ openSocket: () => socket });
    const a = listener();
    hub.join(a.l, ['AAPL']);
    socket.open();
    socket.onclose?.({});
    expect(a.events.closed).toEqual(['dropped']);
  });
});
