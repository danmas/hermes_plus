/**
 * WS-клиент чата (JSON-RPC 2.0 на /api/ws).
 * См. KB/README_WS_PROTOCOL.md
 *
 * Использование:
 *   const ws = new HermesWsClient({ baseUrl, token, profile });
 *   ws.onEvent((ev) => ...);          // стрим-события (message.delta, tool.start, ...)
 *   await ws.connect();
 *   const r = await ws.call('session.list', {});   // RPC-запрос с id
 *   await ws.call('prompt.submit', { session_id, text });
 */
import type { AgentTarget } from '../types/agent';
import { WsRequest, WsResponse, WsEvent } from '../types/ws';

export interface WsClientOptions {
  baseUrl: string;
  token?: string;
  profile?: string;
  reconnectMs?: number;
  maxReconnects?: number;
}

export class HermesWsClient {
  private baseUrl: string;
  private token?: string;
  private profile?: string;
  private reconnectMs: number;
  private maxReconnects: number;

  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private reconnectCount = 0;
  private closedByUser = false;

  /** Подписка на события (event-кадры без id) */
  onEvent: (ev: WsEvent['params']) => void = () => {};
  onStatusChange: (connected: boolean) => void = () => {};
  onError: (e: Error) => void = () => {};

  constructor(opts: WsClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.profile = opts.profile;
    this.reconnectMs = opts.reconnectMs ?? 2000;
    this.maxReconnects = opts.maxReconnects ?? 10;
  }

  /** ws://127.0.0.1:9119/api/ws?token=...&profile=... (или same-origin через прокси) */
  private wsUrl(): string {
    // Поддержка относительного адреса или dev-proxy префикса
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    let fullUrl = '';
    if (this.baseUrl.startsWith('http')) {
      const u = new URL(this.baseUrl);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      fullUrl = `${wsProto}//${u.host}/api/ws`;
    } else if (this.baseUrl) {
      fullUrl = `${protocol}//${host}${this.baseUrl}/api/ws`;
    } else {
      fullUrl = `${protocol}//${host}/api/ws`;
    }

    const u = new URL(fullUrl);
    if (this.token) u.searchParams.set('token', this.token);
    if (this.profile) u.searchParams.set('profile', this.profile);
    return u.toString();
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.wsUrl());
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectCount = 0;
        this.onStatusChange(true);
        resolve();
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data);
      ws.onclose = () => {
        this.onStatusChange(false);
        if (!this.closedByUser && this.reconnectCount < this.maxReconnects) {
          this.reconnectCount++;
          setTimeout(() => this.connect(), this.reconnectMs);
        }
      };
      ws.onerror = () => {
        this.onError(new Error('WS error'));
        // onerror затем onclose — реконнект обработается там
      };
    });
  }

  private handleMessage(data: unknown) {
    let msg: unknown;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    const m = msg as Record<string, unknown>;
    console.debug('[WS] Received frame:', m);
    if (m.id !== undefined && m.jsonrpc === '2.0') {
      const resp = m as unknown as WsResponse;
      const waiter = this.pending.get(resp.id);
      if (waiter) {
        this.pending.delete(resp.id);
        if (resp.error) waiter.reject(new Error(`RPC ${resp.error.code}: ${resp.error.message}`));
        else waiter.resolve(resp.result);
      }
    } else if (m.method === 'event' || (m.method && m.params)) {
      // Некоторые версии Hermes шлют события с методом, отличным от "event" (например, напрямую имя метода/события)
      const ev = m as unknown as WsEvent;
      const params = ev.params || m.payload || m;
      this.onEvent(ev.method === 'event' ? ev.params : { type: String(ev.method), payload: params as any });
    }
  }

  /** RPC-вызов: шлёт запрос с id, резолвится на result/error */
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WS not connected'));
        return;
      }
      const id = this.nextId++;
      const req: WsRequest = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify(req));
    });
  }

  /** Создать новую сессию на стороне JSON-RPC gateway */
  createSession(params?: { profile?: string; model?: string; cwd?: string }): Promise<{ session_id: string; stored_session_id?: string }> {
    return this.call('session.create', { profile: this.profile, ...(params ?? {}) });
  }

  /** Возобновить существующую сессию из state.db */
  resumeSession(sessionId: string, params?: { profile?: string; cols?: number }): Promise<unknown> {
    return this.call('session.resume', { session_id: sessionId, profile: this.profile, ...(params ?? {}) });
  }

  /** Отправить prompt в сессию (чат) */
  submitPrompt(sessionId: string, text: string) {
    return this.call('prompt.submit', {
      session_id: sessionId,
      text,
    });
  }

  /** Прервать выполнение активного хода агента */
  interrupt(sessionId?: string): Promise<unknown> {
    return this.call('slash.exec', { command: '/stop', session_id: sessionId });
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
    for (const { reject } of this.pending.values()) reject(new Error('WS closed'));
    this.pending.clear();
  }
}

/** Клиент по AgentTarget для WS */
export function wsClientFor(target: AgentTarget, token?: string): HermesWsClient {
  return new HermesWsClient({
    baseUrl: target.baseUrl,
    profile: target.profile,
    token: token ?? target.auth.token,
  });
}
