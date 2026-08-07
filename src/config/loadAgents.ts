/**
 * loadAgents — загрузка реестра агентов с middleware `GET /api/agents`.
 *
 * Middleware (см. vite.config.ts) уже прочитал agents-config.json,
 * раскрыл ${ENV_VAR} и провалидировал. Клиент получает готовый FleetConfig.
 *
 * При любой неудаче (сеть, non-2xx, битый JSON, отсутствие файла → 404)
 * возвращает `null`; вызывающий код (agents.ts) падает на FALLBACK_AGENTS.
 */
import type { AgentTarget, FleetConfig } from '../types/agent';

/**
 * Запросить агентов из middleware.
 * @returns массив AgentTarget при успехе, иначе null (→ fallback).
 */
export async function loadAgentsFromConfig(): Promise<AgentTarget[] | null> {
  try {
    const res = await fetch('/api/agents', { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[loadAgents] GET /api/agents → HTTP ${res.status}; используется хардкод-fallback`,
      );
      return null;
    }
    const data = (await res.json()) as FleetConfig;
    if (!data || !Array.isArray(data.agents)) {
      // eslint-disable-next-line no-console
      console.warn('[loadAgents] ответ /api/agents не содержит массив agents; fallback');
      return null;
    }
    return data.agents;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `[loadAgents] не удалось загрузить /api/agents (${
        e instanceof Error ? e.message : String(e)
      }); используется хардкод-fallback`,
    );
    return null;
  }
}
