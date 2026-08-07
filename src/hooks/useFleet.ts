/**
 * Fleet-хуки: опрос всех агентов из реестра.
 * Для UI-скелета — без дизайна, только данные.
 */
import { useQuery } from '@tanstack/react-query';
import { clientFor } from '../api/client';
import type { AgentTarget } from '../types/agent';
import type { HermesStatus } from '../types/hermes';

export interface AgentHealth {
  agent: AgentTarget;
  status: 'online' | 'offline' | 'degraded';
  info?: HermesStatus;
  error?: string;
  skillsCount?: number;
  sessionsCount?: number;
}

/** Проверить одного агента: status + skills + sessions (опционально) */
export async function probeAgent(agent: AgentTarget, opts?: { withCounts?: boolean }): Promise<AgentHealth> {
  const client = clientFor(agent);
  try {
    const info = await client.getStatus();
    let skillsCount: number | undefined;
    let sessionsCount: number | undefined;
    if (opts?.withCounts) {
      try {
        const skills = await client.getSkills();
        skillsCount = Array.isArray(skills) ? skills.length : undefined;
      } catch { /* skills может быть недоступен */ }
      try {
        const sessions = await client.getSessions();
        sessionsCount = sessions.sessions?.length ?? undefined;
      } catch { /* sessions может быть недоступен */ }
    }
    return {
      agent,
      status: info.overall === 'ok' ? 'online' : 'degraded',
      info,
      skillsCount,
      sessionsCount,
    };
  } catch (e) {
    return {
      agent,
      status: 'offline',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Опрос всех агентов (параллельно) */
export async function probeFleet(agents: AgentTarget[], opts?: { withCounts?: boolean }): Promise<AgentHealth[]> {
  return Promise.all(agents.map((a) => probeAgent(a, opts)));
}

/** React-хук: авто-опрос fleet */
export function useFleet(agents: AgentTarget[], opts?: { withCounts?: boolean; refetchMs?: number }) {
  return useQuery({
    queryKey: ['fleet', agents.map((a) => a.id).join(',')],
    queryFn: () => probeFleet(agents, opts),
    refetchInterval: opts?.refetchMs ?? 30_000,
  });
}
