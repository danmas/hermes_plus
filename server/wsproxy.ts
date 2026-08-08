/**
 * server/wsproxy — WS-мост браузер ↔ upstream Hermes.
 *
 * Браузер подключается БЕЗ токенов (кука сессии BFF проверяется на upgrade).
 * BFF сам подставляет upstream-креды:
 * - локальный агент: `?token=<SESSION_TOKEN>` (server-side);
 * - l1: single-use `?ticket=...` (получается на каждый handshake) + Cookie jar.
 *
 * Кадры JSON-RPC 2.0 ретранслируются 1:1 (см. KB/README_WS_PROTOCOL.md).
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';

/** Двусторонний мост клиентского WS к upstream-URL. */
export function bridgeWs(clientWs: WebSocket, upstreamUrl: string, headers?: Record<string, string>): void {
  const up = new WebSocket(upstreamUrl, headers ? { headers } : undefined);
  let upOpen = false;
  const pendingToUp: Array<{ data: unknown; binary: boolean }> = [];

  up.on('open', () => {
    upOpen = true;
    for (const m of pendingToUp) up.send(m.data as never, { binary: m.binary });
    pendingToUp.length = 0;
  });

  up.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  clientWs.on('message', (data, isBinary) => {
    if (upOpen && up.readyState === WebSocket.OPEN) {
      up.send(data, { binary: isBinary });
    } else if (up.readyState === WebSocket.CONNECTING) {
      pendingToUp.push({ data, binary: isBinary });
    }
  });

  let closing = false;
  const closePair = (code: number, reason: Buffer, target: WebSocket) => {
    if (closing) return;
    closing = true;
    try {
      target.close(code, reason);
    } catch {
      /* уже закрыт */
    }
  };
  clientWs.on('close', (code, reason) => closePair(code, reason, up));
  up.on('close', (code, reason) => closePair(code, reason, clientWs));

  up.on('error', (err) => {
    console.warn('[bff:ws] upstream error:', err.message);
    closePair(1011, Buffer.from('upstream error'), clientWs);
  });
  up.on('unexpected-response', (_req, res) => {
    console.warn(`[bff:ws] upstream unexpected response: HTTP ${res.statusCode}`);
    closePair(1011, Buffer.from(`upstream HTTP ${res.statusCode}`), clientWs);
  });
  clientWs.on('error', (err) => {
    console.warn('[bff:ws] client error:', err.message);
    closePair(1011, Buffer.from('client error'), up);
  });
}

/**
 * Обработать HTTP-upgrade: проверить путь, завершить handshake на стороне
 * клиента и поднять мост к upstream.
 *
 * @returns true, если upgrade обработан (успех или отказ с записью в socket).
 */
export async function handleUpgrade(opts: {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  wss: WebSocketServer;
  /** Подготовка upstream-подключения: URL + заголовки. null = отказать. */
  prepare: (clientQuery: URLSearchParams) => Promise<{ url: string; headers?: Record<string, string> } | null>;
}): Promise<boolean> {
  const { req, socket, head, wss, prepare } = opts;
  try {
    const clientQuery = new URL(req.url ?? '', 'http://localhost').searchParams;
    // Токены/тикеты клиента не принимаем — upstream-креды подставляет BFF
    clientQuery.delete('token');
    clientQuery.delete('ticket');

    const target = await prepare(clientQuery);
    if (!target) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      return true;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      bridgeWs(clientWs, target.url, target.headers);
    });
    return true;
  } catch (e) {
    console.warn('[bff:ws] upgrade failed:', e instanceof Error ? e.message : String(e));
    try {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    } catch {
      /* ignore */
    }
    return true;
  }
}
