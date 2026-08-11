/**
 * Browser client for BFF skill export/import (openspec skills-copy-dnd).
 * Works when UI is served by prod-BFF (operator session cookie).
 */
export interface SkillPackageFile {
  relativePath: string;
  content: string;
  encoding: 'utf-8' | 'base64';
}

export interface SkillPackage {
  version: 1;
  name: string;
  category?: string;
  source: { agentId: string; profile?: string };
  files: SkillPackageFile[];
  meta?: { exportedAt: string; fileCount: number; totalBytes: number };
}

export class SkillTransferError extends Error {
  constructor(
    message: string,
    public status?: number,
    public cleanedUp?: boolean,
    public cleanupFailed?: boolean,
  ) {
    super(message);
    this.name = 'SkillTransferError';
  }
}

async function parseError(res: Response): Promise<SkillTransferError> {
  let msg = `HTTP ${res.status}`;
  let cleanedUp: boolean | undefined;
  let cleanupFailed: boolean | undefined;
  try {
    const j = (await res.json()) as {
      error?: string;
      detail?: string;
      details?: string;
      cleanedUp?: boolean;
      cleanupFailed?: boolean;
    };
    if (typeof j.error === 'string' && j.error) msg = j.error;
    else if (typeof j.detail === 'string' && j.detail) msg = j.detail;
    else if (typeof j.details === 'string' && j.details) msg = j.details;
    cleanedUp = j.cleanedUp;
    cleanupFailed = j.cleanupFailed;
    if (res.status === 405 && msg.startsWith('HTTP ')) {
      msg =
        'export/import недоступны на dev-сервере (405). Перезапустите `npm run dev` — нужен skill-transfer middleware.';
    }
  } catch {
    if (res.status === 405) {
      msg =
        'export/import недоступны (405). Перезапустите `npm run dev` после обновления vite.config.';
    }
  }
  return new SkillTransferError(msg, res.status, cleanedUp, cleanupFailed);
}

export async function exportSkill(
  agentId: string,
  skillName: string,
): Promise<SkillPackage> {
  const res = await fetch('/api/skills/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ agentId, skillName }),
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as { package?: SkillPackage };
  if (!data.package) throw new SkillTransferError('export: empty package');
  return data.package;
}

export async function importSkill(
  agentId: string,
  pkg: SkillPackage,
  nameOverride?: string,
): Promise<{ name: string; fileCount: number }> {
  const res = await fetch('/api/skills/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ agentId, package: pkg, nameOverride }),
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as { name?: string; fileCount?: number };
  return { name: data.name || nameOverride || pkg.name, fileCount: data.fileCount ?? pkg.files.length };
}

/** Full copy pipeline with optional rename. */
export async function copySkillToAgent(opts: {
  sourceAgentId: string;
  targetAgentId: string;
  skillName: string;
  nameOverride?: string;
}): Promise<{ name: string; fileCount: number }> {
  if (opts.sourceAgentId === opts.targetAgentId && !opts.nameOverride) {
    throw new SkillTransferError('source and target agent are the same');
  }
  const pkg = await exportSkill(opts.sourceAgentId, opts.skillName);
  return importSkill(opts.targetAgentId, pkg, opts.nameOverride);
}
