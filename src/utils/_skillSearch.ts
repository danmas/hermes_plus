/**
 * Поиск по skills (openspec/changes/skills-browser-search).
 * MVP: client-side filter по метаданным list; fleet = fan-out getSkills.
 */
import { clientFor } from '../api/client';
import type { AgentTarget } from '../types/agent';
import type { HermesSkill } from '../types/hermes';

/** Case-insensitive substring match по name/description/path/category. */
export function skillMatchesQuery(skill: HermesSkill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields = [skill.name, skill.description, skill.path, skill.category, skill.provenance];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

export function filterSkills(skills: HermesSkill[], query: string): HermesSkill[] {
  const q = query.trim();
  if (!q) return skills;
  return skills.filter((s) => skillMatchesQuery(s, q));
}

/**
 * Пользовательский skill: создан/появился в процессе работы.
 * Hermes web: provenance = hub | bundled | agent
 * (agent = agent-authored + local hand-made — см. web_routers/skills.py).
 */
export function isUserSkill(skill: HermesSkill): boolean {
  const p = (skill.provenance || '').toLowerCase();
  if (p === 'agent' || p === 'user' || p === 'local' || p === 'custom') return true;
  if (p === 'hub' || p === 'bundled') return false;
  // если provenance нет — не считаем «из коробки»
  if (!p) return true;
  return false;
}

/**
 * Timestamp для сортировки desc (мс).
 * Hermes list сейчас не отдаёт mtime — пробуем известные поля, иначе 0.
 */
export function skillActivityMs(skill: HermesSkill): number {
  const candidates = [
    skill.mtime,
    skill.modified_at,
    skill.updated_at,
    skill.last_modified,
    skill.created_at,
    skill.ctime,
  ];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      // секунды vs миллисекунды
      return v < 1e12 ? v * 1000 : v;
    }
    if (typeof v === 'string' && v.trim()) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return 0;
}

function compareUserSkills(a: HermesSkill, b: HermesSkill): number {
  const ta = skillActivityMs(a);
  const tb = skillActivityMs(b);
  if (ta !== tb) return tb - ta; // desc by mtime/created
  const ua = typeof a.usage === 'number' ? a.usage : 0;
  const ub = typeof b.usage === 'number' ? b.usage : 0;
  if (ua !== ub) return ub - ua; // proxy «свежести» если дат нет
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}

function compareStockSkills(a: HermesSkill, b: HermesSkill): number {
  const ca = (a.category || '').localeCompare(b.category || '', undefined, { sensitivity: 'base' });
  if (ca !== 0) return ca;
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}

/** Пользовательские сверху (по дате/usage desc), затем из коробки. */
export function sortSkillsUserFirst(skills: HermesSkill[]): HermesSkill[] {
  const user: HermesSkill[] = [];
  const stock: HermesSkill[] = [];
  for (const s of skills) {
    if (isUserSkill(s)) user.push(s);
    else stock.push(s);
  }
  user.sort(compareUserSkills);
  stock.sort(compareStockSkills);
  return [...user, ...stock];
}

export function partitionSkills(skills: HermesSkill[]): {
  user: HermesSkill[];
  stock: HermesSkill[];
} {
  const sorted = sortSkillsUserFirst(skills);
  return {
    user: sorted.filter(isUserSkill),
    stock: sorted.filter((s) => !isUserSkill(s)),
  };
}

/** Найти совпадения в тексте skill (in-skill scope). */
export function findContentMatches(
  content: string,
  query: string,
): Array<{ index: number; length: number }> {
  const q = query.trim();
  if (!q || !content) return [];
  const lower = content.toLowerCase();
  const needle = q.toLowerCase();
  const out: Array<{ index: number; length: number }> = [];
  let from = 0;
  while (from < lower.length) {
    const i = lower.indexOf(needle, from);
    if (i === -1) break;
    out.push({ index: i, length: needle.length });
    from = i + Math.max(1, needle.length);
    if (out.length >= 200) break;
  }
  return out;
}

export interface FleetSkillHit extends HermesSkill {
  agentId: string;
  agentName: string;
  profile?: string;
}

export interface FleetSkillError {
  agentId: string;
  agentName: string;
  error: string;
}

export interface FleetSkillSearchResult {
  hits: FleetSkillHit[];
  errors: FleetSkillError[];
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

/**
 * Fan-out getSkills + client filter по реестру.
 * skip: offline targets (из fleet health).
 */
export async function searchFleetSkills(
  targets: Array<{ agent: AgentTarget; skip?: boolean }>,
  query: string,
  opts?: { timeoutMs?: number },
): Promise<FleetSkillSearchResult> {
  const timeoutMs = opts?.timeoutMs ?? 3000;
  const hits: FleetSkillHit[] = [];
  const errors: FleetSkillError[] = [];
  const skipped: Array<{ agentId: string; agentName: string }> = [];

  const jobs = targets.map(async ({ agent, skip }) => {
    if (skip) {
      skipped.push({ agentId: agent.id, agentName: agent.name });
      return;
    }
    try {
      const client = clientFor(agent);
      const list = await withTimeout(client.getSkills(), timeoutMs);
      const matched = sortSkillsUserFirst(filterSkills(list, query));
      for (const s of matched) {
        hits.push({
          ...s,
          agentId: agent.id,
          agentName: agent.name,
          profile: agent.profile,
        });
      }
    } catch (e) {
      errors.push({
        agentId: agent.id,
        agentName: agent.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  await Promise.all(jobs);

  // user skills first globally, then by name, then agent
  hits.sort((a, b) => {
    const ua = isUserSkill(a) ? 0 : 1;
    const ub = isUserSkill(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (isUserSkill(a)) {
      const ta = skillActivityMs(a);
      const tb = skillActivityMs(b);
      if (ta !== tb) return tb - ta;
    }
    const byName = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.agentId.localeCompare(b.agentId);
  });

  return { hits, errors, skipped };
}
