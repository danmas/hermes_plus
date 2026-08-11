/**
 * Утилиты поиска по сессиям (openspec/changes/sessions-search).
 *
 * - parseSnippet: сервер размечает совпадение в snippet маркерами
 *   `>>>match<<<` (живой замер 2026-08-10, Hermes 0.20.0).
 * - searchFleetSessions: fan-out `/api/sessions/search` по реестру агентов
 *   (Promise.allSettled + per-target таймаут, частичные отказы не валят общий
 *   результат — design.md D3).
 */
import { clientFor } from '../api/client';
import { normalizeTimestamp } from './_sessionDates';
import type { AgentTarget } from '../types/agent';
import type { SessionSearchHit } from '../types/hermes';

/** Разобрать snippet с маркерами `>>>` / `<<<` на сегменты для подсветки. */
export interface SnippetPart {
  text: string;
  match: boolean;
}

export function parseSnippet(snippet: string | undefined | null): SnippetPart[] {
  if (!snippet) return [];
  const parts: SnippetPart[] = [];
  // Маркеры могут повторяться несколько раз; идём по строке конечным автоматом.
  let rest = snippet;
  let inMatch = false;
  while (rest.length > 0) {
    const open = rest.indexOf('>>>');
    const close = rest.indexOf('<<<');
    if (!inMatch) {
      if (open === -1) {
        parts.push({ text: rest, match: false });
        break;
      }
      if (open > 0) parts.push({ text: rest.slice(0, open), match: false });
      rest = rest.slice(open + 3);
      inMatch = true;
    } else {
      if (close === -1) {
        // Незакрытый маркер — считаем остаток обычным текстом.
        parts.push({ text: rest, match: false });
        break;
      }
      if (close > 0) parts.push({ text: rest.slice(0, close), match: true });
      rest = rest.slice(close + 3);
      inMatch = false;
    }
  }
  return parts.filter((p) => p.text.length > 0);
}

/** Хит fleet-поиска: хит FTS + идентичность агента-источника. */
export interface FleetSearchHit extends SessionSearchHit {
  agentId: string;
  agentName: string;
  profile?: string;
}

export interface FleetTargetError {
  agentId: string;
  agentName: string;
  error: string;
}

export interface FleetSearchResult {
  hits: FleetSearchHit[];
  errors: FleetTargetError[];
  /** Таргеты, пропущенные без запроса (напр. offline по данным health). */
  skipped: Array<{ agentId: string; agentName: string }>;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Ключ сортировки хитов: самое свежее сверху (started_at → last_active). */
function hitTime(h: SessionSearchHit): number {
  return (
    normalizeTimestamp(h.started_at) ??
    normalizeTimestamp(h.last_active) ??
    normalizeTimestamp(h.session_started) ??
    0
  );
}

/**
 * Параллельный FTS-поиск по списку таргетов.
 * Один мёртвый/медленный хост не блокирует выдачу: per-target таймаут
 * (по умолчанию 3 с) + Promise.allSettled; ошибки собираются отдельно.
 */
export async function searchFleetSessions(
  targets: Array<{ agent: AgentTarget; skip?: boolean }>,
  q: string,
  opts?: { timeoutMs?: number },
): Promise<FleetSearchResult> {
  const timeoutMs = opts?.timeoutMs ?? 3000;
  const hits: FleetSearchHit[] = [];
  const errors: FleetTargetError[] = [];
  const skipped: FleetSearchResult['skipped'] = [];

  const tasks = targets.map(async ({ agent, skip }) => {
    if (skip) {
      skipped.push({ agentId: agent.id, agentName: agent.name });
      return;
    }
    try {
      const client = clientFor(agent);
      const res = await withTimeout(client.searchSessions(q), timeoutMs);
      for (const h of res.results ?? []) {
        hits.push({ ...h, agentId: agent.id, agentName: agent.name, profile: agent.profile });
      }
    } catch (e) {
      errors.push({
        agentId: agent.id,
        agentName: agent.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  await Promise.allSettled(tasks);
  hits.sort((a, b) => hitTime(b) - hitTime(a));
  return { hits, errors, skipped };
}
