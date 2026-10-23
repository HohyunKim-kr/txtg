import type { Network } from "./config";

export type Subscription = { type: string } & Record<string, unknown>;
type Handler = (data: unknown) => void;

interface Entry {
  sub: Subscription;
  handlers: Set<Handler>;
}

/** Channel name the server pushes for a subscription type. */
const CHANNEL_OF: Record<string, string> = { positionUpdates: "position" };

const PING_MS = 10_000;

/**
 * `/ws` client: one multiplexed socket, 10 s ping, reconnect with backoff,
 * re-subscribe everything after a reconnect.
 */
export class TxFlowSocket {
  private ws?: WebSocket;
  private subs = new Map<string, Entry>();
  private ping?: ReturnType<typeof setInterval>;
  private retry = 0;
  private closed = false;

  constructor(private network: Network) {}

  /**
   * Subscribe; returns an unsubscribe function. Handlers get every push on the
   * subscription's channel — filter by coin/user in the handler when several
   * subscriptions share a channel.
   */
  subscribe(sub: Subscription, handler: Handler): () => void {
    const key = JSON.stringify(sub);
    let entry = this.subs.get(key);
    if (!entry) {
      entry = { sub, handlers: new Set() };
      this.subs.set(key, entry);
      this.send("subscribe", sub);
    }
    entry.handlers.add(handler);
    this.connect();
    return () => {
      const e = this.subs.get(key);
      if (!e) return;
      e.handlers.delete(handler);
      if (e.handlers.size === 0) {
        this.subs.delete(key);
        this.send("unsubscribe", sub);
      }
    };
  }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    this.ws?.close();
  }

  private connect() {
    if (this.ws || this.closed) return;
    const ws = new WebSocket(this.network.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const { sub } of this.subs.values()) this.send("subscribe", sub);
      this.ping = setInterval(() => ws.send(JSON.stringify({ method: "ping" })), PING_MS);
    };
    ws.onmessage = (ev) => {
      let msg: { channel?: string; method?: string; data?: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.method === "PONG" || !msg.channel) return;
      for (const { sub, handlers } of this.subs.values()) {
        if ((CHANNEL_OF[sub.type] ?? sub.type) === msg.channel) handlers.forEach((h) => h(msg.data));
      }
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      this.ws = undefined;
      if (this.closed) return;
      const delay = Math.min(30_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private send(method: "subscribe" | "unsubscribe", sub: Subscription) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // /ws routes on the top-level `type`; without it the frame is dropped.
    this.ws.send(JSON.stringify({ method, type: sub.type, subscription: sub }));
  }
}
