/**
 * Типы WS-протокола чата (JSON-RPC 2.0 на /api/ws).
 * См. KB/README_WS_PROTOCOL.md
 */

/** Клиент → сервер: RPC-запрос */
export interface WsRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** Сервер → клиент: RPC-ответ */
export interface WsResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Сервер → клиент: событие (без id) */
export interface WsEvent {
  jsonrpc: '2.0';
  method: 'event';
  params: {
    type: string;
    session_id?: string;
    payload: Record<string, unknown>;
  };
}

export type WsMessage = WsResponse | WsEvent;

/** Типы стрим-событий чата (params.type) */
export const WS_EVENT_TYPES = {
  GATEWAY_READY: 'gateway.ready',
  MESSAGE_DELTA: 'message.delta',
  REASONING_DELTA: 'reasoning.delta',
  THINKING_DELTA: 'thinking.delta',
  TOOL_START: 'tool.start',
  TOOL_GENERATING: 'tool.generating',
  TOOL_COMPLETE: 'tool.complete',
  TOOL_OUTPUT_RISK: 'tool.output_risk',
  TURN_START: 'turn.start',
  TURN_STARTED: 'turn.started',
  TURN_END: 'turn.end',
  TURN_ERROR: 'turn.error',
  APPROVAL_REQUEST: 'approval.request',
} as const;

/** Основные RPC-методы (tui_gateway) */
export const WS_METHODS = {
  PROMPT_SUBMIT: 'prompt.submit',
  SLASH_EXEC: 'slash.exec',
  SESSION_LIST: 'session.list',
  SESSION_ACTIVE_LIST: 'session.active_list',
  SESSION_RESUME: 'session.resume',
  MODEL_OPTIONS: 'model.options',
  SHELL_EXEC: 'shell.exec',
} as const;
