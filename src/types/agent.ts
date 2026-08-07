/**
 * AgentTarget — единица маршрутизации в fleet.
 * Каждый Hermes (машина + профиль) = отдельный target.
 * См. KB/README_FLEET.md
 */

export type AgentAuthType = 'none' | 'session-token' | 'bearer' | 'cookie';

export interface AgentAuth {
  type: AgentAuthType;
  /** SESSION_TOKEN (из env HERMES_DASHBOARD_SESSION_TOKEN или SPA HTML) */
  token?: string;
  /** Для type: 'cookie' — логин/пароль берутся из env HERMES_L1_USERNAME / HERMES_L1_PASSWORD */
  username?: string;
  password?: string;
}

export interface AgentTarget {
  /** Уникальный id: "home-lab:projects-ex" */
  id: string;
  /** Человекочитаемая метка */
  name: string;
  /** http://100.x.x.x:9119 или туннель */
  baseUrl: string;
  /** Для удалённых агентов через dev-proxy: путь-префикс, напр. '/l1' → 192.168.1.221:9119 */
  proxyPath?: string;
  /** Профиль Hermes: "projects-ex" | "default" | ... */
  profile?: string;
  auth: AgentAuth;
  tags?: string[];
  /** Кэш skills/toolsets (для skills matrix) */
  capabilities?: string[];
  lastSeenAt?: string;
  status?: 'online' | 'offline' | 'degraded';
}

/** Реестр агентов — конфиг (агенты руками, не авто-поиск) */
export interface FleetConfig {
  agents: AgentTarget[];
}
