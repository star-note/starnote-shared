import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { backoffDelay, NoteSocket, socketUrl, type ServerMessage } from '../ws';

class FakeWS {
  static instances: FakeWS[] = [];
  readyState = 0;
  protocol = '';
  binaryType = 'blob';
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWS.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close() {
    this.readyState = 3;
  }
  open(protocol: string) {
    this.readyState = 1;
    this.protocol = protocol;
    this.onopen?.();
  }
  message(msg: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ ts: 'now', ...msg }) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const latest = () => FakeWS.instances[FakeWS.instances.length - 1];

function make(extra: Partial<ConstructorParameters<typeof NoteSocket>[0]> = {}) {
  const messages: ServerMessage[] = [];
  const statuses: string[] = [];
  const fatal: number[] = [];
  const socket = new NoteSocket({
    noteId: 'n1',
    clientId: 'tab-1',
    yjs: false,
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onFatal: (c) => fatal.push(c),
    WebSocketImpl: FakeWS as unknown as typeof WebSocket,
    getToken: () => 'tok',
    refreshToken: vi.fn(async () => 'fresh'),
    ...extra,
  });
  return { socket, messages, statuses, fatal };
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('NoteSocket', () => {
  it('puts the token in the subprotocols and says hello', () => {
    const { socket, statuses } = make({ yjs: true, sinceVersion: () => 7 });
    socket.connect();
    const ws = latest();
    expect(ws.url).toBe(socketUrl('n1'));
    expect(ws.protocols).toEqual(['starnote.y.v1', 'starnote.v1', 'bearer.tok']);
    ws.open('starnote.y.v1');
    expect(socket.yjs).toBe(true);
    expect(ws.sent[0]).toMatchObject({ t: 'hello', client_id: 'tab-1', since_version: 7 });
    ws.message({ t: 'welcome', peers: [], lock: null, features: { yjs: true } });
    expect(statuses).toEqual(['connecting', 'online']);
  });

  it('answers auth.refresh with a fresh token', async () => {
    const { socket, messages } = make();
    socket.connect();
    latest().open('starnote.v1');
    latest().message({ t: 'auth.refresh' });
    await vi.runAllTicks();
    await Promise.resolve();
    expect(latest().sent).toContainEqual({ t: 'auth', token: 'fresh' });
    expect(messages.find((m) => m.t === 'auth.refresh')).toBeUndefined();
  });

  it('reconnects with backoff, refreshes on 4401 and stops on 4403 / 4404', async () => {
    const { socket, fatal } = make();
    socket.connect();
    latest().drop(1006);
    expect(FakeWS.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1300);
    expect(FakeWS.instances).toHaveLength(2);
    latest().drop(4401); // token expired → refresh, reconnect at once
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeWS.instances).toHaveLength(3);
    latest().drop(4404);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWS.instances).toHaveLength(3);
    expect(fatal).toEqual([4404]);
  });

  it('close() stops for good', async () => {
    const { socket, statuses } = make();
    socket.connect();
    latest().open('starnote.v1');
    socket.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWS.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('offline');
  });

  it('backoff grows to 30 s with ±25 % jitter', () => {
    expect(backoffDelay(0, () => 0.5)).toBe(1000);
    expect(backoffDelay(3, () => 0.5)).toBe(8000);
    expect(backoffDelay(20, () => 0.5)).toBe(30_000);
    expect(backoffDelay(0, () => 0)).toBe(750);
    expect(backoffDelay(0, () => 1)).toBe(1250);
  });

  it('builds ws(s) URLs from the page origin', () => {
    expect(socketUrl('a b', { protocol: 'https:', host: 'x.com' })).toBe(
      'wss://x.com/api/v1/ws/notes/a%20b',
    );
    expect(socketUrl('n', { protocol: 'http:', host: 'localhost:5174' })).toBe(
      'ws://localhost:5174/api/v1/ws/notes/n',
    );
  });
});
