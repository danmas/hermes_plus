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

/**
 * Элемент `GET /api/skills` (Hermes web_routers/skills.py).
 * Live shape: name + enabled/usage/provenance; description/path/category — когда есть.
 */
export interface HermesSkill {
  name: string;
  description?: string;
  path?: string;
  enabled?: boolean;
  category?: string;
  /**
   * hub | bundled | agent
   * agent = пользовательские / hand-made (web_routers/skills.py)
   */
  provenance?: string;
  usage?: number;
  /** если Hermes/прокси добавит mtime — используем для сортировки user-skills */
  mtime?: number | string;
  modified_at?: number | string;
  updated_at?: number | string;
  created_at?: number | string;
  [k: string]: unknown;
}

/** `GET /api/skills/content?name=` → { name, content, path } */
export interface HermesSkillContent {
  name: string;
  content: string;
  path?: string;
}

export interface SessionsListResponse {
  sessions: HermesSession[];
  total?: number;
  limit?: number;
  offset?: number;
}

/**
 * Хит FTS5-поиска `GET /api/sessions/search?q=...`.
 * Живой замер 2026-08-10 (Hermes 0.20.0, l1 192.168.1.221): envelope
 * `{ results: [...] }`; `snippet` содержит совпадение, размеченное
 * маркерами `>>>match<<<`.
 */
export interface SessionSearchHit {
  id: string;
  session_id?: string;
  lineage_root?: string;
  title?: string;
  preview?: string;
  snippet?: string;
  role?: string;
  source?: string;
  model?: string;
  started_at?: number;
  ended_at?: number | null;
  session_started?: number;
  last_active?: number;
  is_active?: boolean;
  message_count?: number;
  tool_call_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  parent_session_id?: string | null;
  archived?: boolean;
  [k: string]: unknown;
}

export interface SessionSearchResponse {
  results: SessionSearchHit[];
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
