/**
 * Типы ответов web-API дашборда Hermes (порт 9119).
 * Снято с Hermes 0.20.0 — см. KB/README_SURVEY.md.
 */

export interface HermesStatus {
  version: string;
  release_date?: string;
  config_version: number;
  latest_config_version?: number;
  can_update_hermes?: boolean;
  gateway_running: boolean;
  gateway_state?: string;
  gateway_platforms?: Record<string, { state: string; error_code?: string | null; error_message?: string | null }>;
  gateway_exit_reason?: string | null;
  active_agents?: number;
  gateway_busy?: boolean;
  active_sessions?: number;
  auth_required: boolean;
  auth_providers?: string[];
  overall?: string;
  profiles?: string[];
  hermes_home?: string;
  config_path?: string;
  gateway_pid?: number;
  components?: Record<string, { status: string; state?: string }>;
}

export interface HermesSession {
  id: string;
  source?: string;
  user_id?: string;
  session_key?: string;
  chat_id?: string;
  chat_type?: string;
  thread_id?: string | null;
  display_name?: string;
  model?: string;
  parent_session_id?: string | null;
  started_at?: number;
  ended_at?: number | null;
  title?: string;
  preview?: string;
  message_count?: number;
  bytes?: number;
  total_tokens?: number;
  [k: string]: unknown;
}

export interface HermesSessionMessage {
  id?: string;
  role: string;
  content?: string;
  model?: string;
  timestamp?: number;
  tool_calls?: unknown[];
  [k: string]: unknown;
}

export interface HermesSkill {
  name: string;
  description?: string;
  path?: string;
  enabled?: boolean;
  category?: string;
  [k: string]: unknown;
}

export interface SessionsListResponse {
  sessions: HermesSession[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface SessionMessagesResponse {
  session_id: string;
  messages: HermesSessionMessage[];
  pagination?: {
    limit?: number;
    offset?: number;
    total?: number;
    has_more?: boolean;
    [k: string]: unknown;
  };
}

/** GET /api/health — публичный health-check, содержит auth_required */
export interface HermesHealth {
  ok: boolean;
  version?: string;
  auth_required?: boolean;
}

/** Ответ на ошибку FastAPI: {"detail": "..."} */
export interface ApiErrorBody {
  detail?: string;
}
