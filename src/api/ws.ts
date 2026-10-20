/**
 * Real-time collaboration socket (SPEC-r2-collaboration §3.1 / §3.2 / §4.1).
 *
 * One WebSocket per open note: JSON text frames carry presence, typing, the soft lock and `note.updated`; binary
 * frames (Phase 2) carry y-protocols sync / awareness. The access token rides in the subprotocol list
 * (`starnote.v1, bearer.<token>`, plus `starnote.y.v1` first when we would like Yjs); the server answers with the
 * mode it actually grants.
 */
import { API_BASE, currentAccessToken, refreshAccessToken } from './client';

export interface UserBrief {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
}
export interface PeerCursor {
  anchor: number;
  head: number;
  title?: boolean;
}
export interface Peer {
  client_id: string;
  user: UserBrief;
  color: string;
  cursor?: PeerCursor;
  typing: boolean;
  joined_at: string;
}
export interface Lock {
  client_id: string;
  user: UserBrief;
  acquired_at: string;
  expires_at: string;
}
export type NoteChanged = 'title' | 'content' | 'pinned' | 'tags' | 'moved' | 'trashed';
export interface NoteAccessCan {
  edit: boolean;
  delete: boolean;
  publish: boolean;
  comment: boolean;
}

export type ClientMessage =
  | { t: 'hello'; client_id: string; ua?: string; since_version?: number }
  | { t: 'cursor'; anchor: number; head: number; title?: boolean }
  | { t: 'typing'; on: boolean }
  | { t: 'lock.acquire'; reason?: 'edit' | 'takeover' }
  | { t: 'lock.release' }
  | { t: 'lock.heartbeat' }
  | { t: 'lock.request' }
  | { t: 'saved'; version: number }
  | { t: 'flush' }
  | { t: 'auth'; token: string }
  | { t: 'ping' };

export type LockReason = 'acquired' | 'released' | 'expired' | 'taken_over' | 'denied';

export type ServerMessage = { ts: string } & (
  | {
      t: 'welcome';
      client_id: string;
      me: { user: UserBrief & { color: string }; role: string | null; can: NoteAccessCan };
      note: { version: number; updated_at: string; updated_by: UserBrief };
      peers: Peer[];
      lock: Lock | null;
      features: { yjs: boolean };
    }
  | { t: 'join'; peer: Peer }
  | { t: 'leave'; peer: Peer }
  | { t: 'cursor'; client_id: string; anchor: number; head: number; title?: boolean }
  | { t: 'typing'; client_id: string; on: boolean }
  | { t: 'lock'; lock: Lock | null; reason: LockReason; by?: string }
  | { t: 'lock.requested'; by: Peer }
  | {
      t: 'note.updated';
      version: number;
      updated_at: string;
      updated_by: UserBrief;
      changed: NoteChanged[];
      by_client?: string;
      /** Written by the Yjs room (materialization), not by a REST save. */
      live?: boolean;
    }
  | { t: 'flushed'; version: number | null }
  | { t: 'auth.refresh' }
  | { t: 'error'; code: number; message: string; ref?: string }
  | { t: 'pong' }
);

export type SocketStatus = 'offline' | 'connecting' | 'online';

/** Close codes (§3.1): these stop the reconnect loop; everything else retries with backoff. */
export const CLOSE = {
  unauthorized: 4401,
  forbidden: 4403,
  notFound: 4404,
  duplicate: 4409,
  tooMany: 4429,
  restart: 1012,
};

export const PROTO_V1 = 'starnote.v1';
export const PROTO_Y = 'starnote.y.v1';

/** A random id per tab (survives socket reconnects, changes on reload). */
export function newClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 1 s, 2 s, 4 s … capped at 30 s, ±25 % jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + random() * 0.5));
}

export function socketUrl(
  noteId: string,
  loc: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const base = API_BASE.startsWith('http')
    ? API_BASE.replace(/^http/, 'ws')
    : `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${API_BASE}`;
  return `${base}/ws/notes/${encodeURIComponent(noteId)}`;
}

export interface NoteSocketOptions {
  noteId: string;
  clientId: string;
  /** Ask for Yjs (`starnote.y.v1`); the server may still answer `starnote.v1`. */
  yjs: boolean;
  sinceVersion?: () => number | undefined;
  onMessage(msg: ServerMessage): void;
  onBinary?(data: Uint8Array): void;
  onStatus?(status: SocketStatus): void;
  /** The socket opened; `yjs` = the mode the server granted. Called before `welcome` arrives. */
  onOpen?(info: { yjs: boolean }): void;
  /** Gave up for good (no access / note gone / signed out). */
  onFatal?(code: number): void;
  WebSocketImpl?: typeof WebSocket;
  getToken?: () => string | null;
  refreshToken?: () => Promise<string>;
}

const PING_MS = 30_000;

export class NoteSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  status: SocketStatus = 'offline';
  /** Mode granted by the server for the current connection. */
  yjs = false;

  constructor(private readonly opts: NoteSocketOptions) {}

  private get WS() {
    return this.opts.WebSocketImpl ?? WebSocket;
  }

  private setStatus(status: SocketStatus) {
    if (status === this.status) return;
    this.status = status;
    this.opts.onStatus?.(status);
  }

  connect() {
    this.stopped = false;
    this.open();
  }

  private open() {
    if (this.stopped) return;
    const token = (this.opts.getToken ?? currentAccessToken)();
    if (!token) {
      void this.refreshThenRetry();
      return;
    }
    const protocols = [...(this.opts.yjs ? [PROTO_Y] : []), PROTO_V1, `bearer.${token}`];
    let ws: WebSocket;
    try {
      ws = new this.WS(socketUrl(this.opts.noteId), protocols);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.yjs = ws.protocol === PROTO_Y;
      this.opts.onOpen?.({ yjs: this.yjs });
      this.send({
        t: 'hello',
        client_id: this.opts.clientId,
        ua: navigator.userAgent.slice(0, 120),
        since_version: this.opts.sinceVersion?.(),
      });
      this.ping = setInterval(() => this.send({ t: 'ping' }), PING_MS);
    };
    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'welcome') {
          this.attempt = 0;
          this.setStatus('online');
        }
        if (msg.t === 'auth.refresh') {
          void this.answerRefresh();
          return;
        }
        this.opts.onMessage(msg);
      } else if (event.data instanceof ArrayBuffer) {
        this.opts.onBinary?.(new Uint8Array(event.data));
      }
    };
    ws.onclose = (event: CloseEvent) => {
      if (this.ws !== ws) return;
      this.cleanup();
      this.setStatus('offline');
      if (this.stopped) return;
      if (event.code === CLOSE.unauthorized) {
        void this.refreshThenRetry();
      } else if (event.code === CLOSE.forbidden || event.code === CLOSE.notFound) {
        this.stopped = true;
        this.opts.onFatal?.(event.code);
      } else if (event.code === CLOSE.restart) {
        this.timer = setTimeout(() => this.open(), 200);
      } else {
        this.scheduleReconnect();
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private async answerRefresh() {
    try {
      const token = await (this.opts.refreshToken ?? refreshAccessToken)();
      this.send({ t: 'auth', token });
    } catch {
      /* the server closes with 4401 and we try again from scratch */
    }
  }

  private async refreshThenRetry() {
    try {
      await (this.opts.refreshToken ?? refreshAccessToken)();
      this.attempt = 0;
      this.scheduleReconnect(0);
    } catch {
      this.stopped = true;
      this.opts.onFatal?.(CLOSE.unauthorized);
    }
  }

  private scheduleReconnect(delay?: number) {
    if (this.stopped) return;
    const wait = delay ?? backoffDelay(this.attempt++);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.open(), wait);
  }

  /** Try now (e.g. the browser came back online). */
  reconnectNow() {
    if (this.stopped || this.status !== 'offline') return;
    this.attempt = 0;
    this.scheduleReconnect(0);
  }

  private cleanup() {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
    }
    this.ws = null;
  }

  get isOpen() {
    return this.ws?.readyState === 1;
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(data: Uint8Array) {
    if (this.ws?.readyState === 1) this.ws.send(data);
  }

  close() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const ws = this.ws;
    this.cleanup();
    if (ws && ws.readyState <= 1) ws.close(1000, 'bye');
    this.setStatus('offline');
  }
}
