/**
 * Реестр агентов (fleet config) — FALLBACK.
 *
 * ⚠️  Основной источник правды — `agents-config.json` в корне проекта.
 *     Редактируйте его, чтобы добавить/убрать агента (см. KB/README_FLEET.md).
 *     Этот массив используется как fallback, если middleware `/api/agents`
 *     недоступен (файл удалён, ошибка валидации, non-dev сборка).
 *
 * baseUrl='' означает same-origin: запрос идёт на Vite (5173), который
 * проксирует на 127.0.0.1:9119 (см. vite.config.ts). Это dev-режим.
 *
 * l1:default — LAN-агент 192.168.1.221 (см. KB/README_hermes_dashboard_221.md):
 * auth_required:true, basic auth. Креды ТОЛЬКО из env HERMES_L1_USERNAME /
 * HERMES_L1_PASSWORD — никогда литералами (см. openspec hermes-auth).
 */
import type { AgentTarget } from '../types/agent';
import { loadAgentsFromConfig } from './loadAgents';

export const FALLBACK_AGENTS: AgentTarget[] = [
  {
    id: 'local:projects-ex',
    name: 'Local Hermes / projects-ex',
    baseUrl: '',
    profile: 'projects-ex',
    auth: { type: 'session-token' },
    tags: ['local', 'main'],
  },
  {
    id: 'local:default',
    name: 'Local Hermes / default',
    baseUrl: '',
    profile: 'default',
    auth: { type: 'session-token' },
    tags: ['local'],
  },
  {
    id: 'l1:default',
    name: 'L1 Hermes / default (192.168.1.221)',
    // baseUrl='' + proxyPath → same-origin через Vite proxy /l1 → 192.168.1.221:9119
    baseUrl: '',
    proxyPath: '/l1',
    profile: 'default',
    auth: {
      type: 'cookie',
      // Креды ТОЛЬКО из env (Vite подставляет import.meta.env из .env.local);
      // никогда литералами — см. openspec hermes-auth "Credentials are never committed"
      username: import.meta.env.VITE_HERMES_L1_USERNAME,
      password: import.meta.env.VITE_HERMES_L1_PASSWORD,
    },
    tags: ['lan', 'l1'],
  },
];

/**
 * @deprecated Используйте `getAgents()` / `getAgentsSync()`.
 * Оставлено для обратной совместимости; равно FALLBACK_AGENTS.
 */
export const AGENTS: AgentTarget[] = FALLBACK_AGENTS;

/** Кэш агентов, загруженных из agents-config.json (через middleware). */
let cachedAgents: AgentTarget[] | null = null;

/**
 * Асинхронно получить реестр агентов.
 * Пробует `agents-config.json` (middleware /api/agents); при неудаче —
 * возвращает FALLBACK_AGENTS. Результат кэшируется.
 */
export async function getAgents(): Promise<AgentTarget[]> {
  if (cachedAgents) return cachedAgents;
  const loaded = await loadAgentsFromConfig();
  cachedAgents = loaded && loaded.length > 0 ? loaded : FALLBACK_AGENTS;
  return cachedAgents;
}

/**
 * Синхронный доступ: кэш (если `getAgents()` уже отработал) или fallback.
 * Не инициирует загрузку — используйте `getAgents()` для актуальных данных.
 */
export function getAgentsSync(): AgentTarget[] {
  return cachedAgents ?? FALLBACK_AGENTS;
}
