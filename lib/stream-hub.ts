// One upstream trade stream shared by every listener in this server process. Finnhub allows one WebSocket per API
// key, so a socket per browser tab means the second tab is refused and both keep retrying. Here the first listener
// opens the socket, later ones join it, and it closes a little after the last one leaves.
// The socket is injected, so the unit tests drive the hub with a fake one.

import { latestTrades, STREAM_SYMBOL_LIMIT, type LiveTrade } from "@/lib/live-trades";

export type StreamCloseReason = "not-configured" | "unsupported" | "refused" | "dropped";

export type StreamListener = {
    // The stream is open, with the symbols it covers
    onLive(symbols: string[]): void;
    // The newest trade per symbol and session since the last batch
    onTrades(trades: LiveTrade[]): void;
    // The stream stopped; the listener is removed
    onClosed(reason: StreamCloseReason): void;
};

// The parts of a WebSocket the hub uses
export type SocketLike = {
    readonly readyState: number;
    send(data: string): void;
    close(): void;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onclose: ((event: unknown) => void) | null;
};

export type HubOptions = {
    openSocket: () => SocketLike;
    // Trades are passed on at most this often, newest per symbol only
    batchMs?: number;
    // The socket stays open this long after the last listener leaves, so a page reload or the next scheduled
    // reconnect reuses it
    lingerMs?: number;
    // After Finnhub refuses the socket, new listeners are told so at once for this long instead of trying again
    refusedForMs?: number;
    now?: () => number;
};

const OPEN = 1;

export class StreamHub {
    private socket?: SocketLike;
    private opened = false;
    private readonly listeners = new Set<StreamListener>();
    private readonly symbols = new Set<string>();
    private pending = new Map<string, LiveTrade>();
    private batchTimer?: ReturnType<typeof setInterval>;
    private lingerTimer?: ReturnType<typeof setTimeout>;
    private refusedUntil = 0;
    private readonly batchMs: number;
    private readonly lingerMs: number;
    private readonly refusedForMs: number;
    private readonly now: () => number;

    constructor(private readonly options: HubOptions) {
        this.batchMs = options.batchMs ?? 500;
        this.lingerMs = options.lingerMs ?? 30_000;
        this.refusedForMs = options.refusedForMs ?? 60_000;
        this.now = options.now ?? Date.now;
    }

    get listenerCount() {
        return this.listeners.size;
    }

    get streaming() {
        return this.opened && !!this.socket;
    }

    // Starts listening for these symbols (the shared list is capped at the free plan's limit). Returns a function
    // that stops listening.
    join(listener: StreamListener, wanted: readonly string[]): () => void {
        if (this.now() < this.refusedUntil) {
            listener.onClosed("refused");
            return () => {};
        }
        this.listeners.add(listener);
        clearTimeout(this.lingerTimer);
        this.lingerTimer = undefined;

        const added = this.addSymbols(wanted);
        if (!this.socket) this.connect();
        else if (this.opened) {
            for (const symbol of added) this.socket.send(JSON.stringify({ type: "subscribe", symbol }));
            listener.onLive([...this.symbols]);
        }
        return () => this.leave(listener);
    }

    private addSymbols(wanted: readonly string[]): string[] {
        const added: string[] = [];
        for (const symbol of wanted) {
            if (this.symbols.size >= STREAM_SYMBOL_LIMIT) break;
            if (this.symbols.has(symbol)) continue;
            this.symbols.add(symbol);
            added.push(symbol);
        }
        return added;
    }

    private leave(listener: StreamListener) {
        if (!this.listeners.delete(listener) || this.listeners.size) return;
        clearTimeout(this.lingerTimer);
        this.lingerTimer = setTimeout(() => {
            if (!this.listeners.size) this.shutdown();
        }, this.lingerMs);
    }

    private connect() {
        let socket: SocketLike;
        try {
            socket = this.options.openSocket();
        } catch {
            return this.fail("refused");
        }
        this.socket = socket;
        this.opened = false;

        socket.onopen = () => {
            if (this.socket !== socket) return;
            this.opened = true;
            for (const symbol of this.symbols) socket.send(JSON.stringify({ type: "subscribe", symbol }));
            const symbols = [...this.symbols];
            for (const listener of this.listeners) listener.onLive(symbols);
        };
        socket.onmessage = (message) => {
            if (this.socket !== socket) return;
            let data: unknown;
            try {
                data = JSON.parse(typeof message.data === "string" ? message.data : "");
            } catch {
                return;
            }
            if ((data as { type?: unknown })?.type === "error") return this.fail("refused");
            for (const trade of latestTrades(data, this.symbols)) {
                const key = `${trade.symbol} ${trade.session}`;
                const seen = this.pending.get(key);
                if (!seen || trade.time >= seen.time) this.pending.set(key, trade);
            }
        };
        // Finnhub turns away a wrong key or a second connection by closing (or failing) the socket
        socket.onerror = () => {
            if (this.socket === socket) this.fail(this.opened ? "dropped" : "refused");
        };
        socket.onclose = () => {
            if (this.socket === socket) this.fail(this.opened ? "dropped" : "refused");
        };

        this.batchTimer = setInterval(() => this.flush(), this.batchMs);
    }

    private flush() {
        if (!this.pending.size) return;
        const trades = [...this.pending.values()];
        this.pending = new Map();
        for (const listener of this.listeners) listener.onTrades(trades);
    }

    private fail(reason: StreamCloseReason) {
        if (reason === "refused") this.refusedUntil = this.now() + this.refusedForMs;
        this.flush();
        const listeners = [...this.listeners];
        this.listeners.clear();
        this.shutdown();
        for (const listener of listeners) listener.onClosed(reason);
    }

    private shutdown() {
        clearInterval(this.batchTimer);
        clearTimeout(this.lingerTimer);
        this.batchTimer = this.lingerTimer = undefined;
        const socket = this.socket;
        this.socket = undefined;
        this.opened = false;
        this.symbols.clear();
        this.pending.clear();
        if (socket && socket.readyState <= OPEN) {
            try {
                socket.close();
            } catch {}
        }
    }
}
