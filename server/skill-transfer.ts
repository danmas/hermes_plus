/**
 * Export / import skill packages via Hermes fs + skills APIs.
 * openspec skills-copy-dnd (create-mode, full files).
 */
import type { AgentTarget } from '../src/types/agent';
import type { AgentHttp } from './agent-http';
import { AgentHttpError } from './agent-http';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_PACKAGE_BYTES,
  isDeniedBasename,
  joinSkillPath,
  normalizeRelPath,
  toPosixRel,
  type SkillPackage,
  type SkillPackageFile,
} from './skill-package';

interface FsListEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FsListResponse {
  entries?: FsListEntry[];
  error?: string;
}

interface FsReadTextResponse {
  text?: string;
  binary?: boolean;
  truncated?: boolean;
  byteSize?: number;
  path?: string;
}

interface SkillContentResponse {
  name?: string;
  content?: string;
  path?: string;
}

const importLocks = new Set<string>();

export function tryAcquireImportLock(targetAgentId: string, skillName: string): boolean {
  const k = `${targetAgentId}::${skillName}`;
  if (importLocks.has(k)) return false;
  importLocks.add(k);
  return true;
}

export function releaseImportLock(targetAgentId: string, skillName: string): void {
  importLocks.delete(`${targetAgentId}::${skillName}`);
}

async function listDir(http: AgentHttp, absPath: string): Promise<FsListEntry[]> {
  const q = `/api/fs/list?path=${encodeURIComponent(absPath)}`;
  const data = await http.getJson<FsListResponse>(q);
  if (data.error && data.error !== 'ENOENT') {
    throw new Error(`fs/list ${absPath}: ${data.error}`);
  }
  return data.entries ?? [];
}

/** Recursively collect absolute file paths under root. */
async function walkFiles(http: AgentHttp, absDir: string, acc: string[] = []): Promise<string[]> {
  const entries = await listDir(http, absDir);
  for (const e of entries) {
    if (e.isDirectory) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      await walkFiles(http, e.path, acc);
    } else {
      acc.push(e.path);
    }
  }
  return acc;
}

export async function exportSkillPackage(
  http: AgentHttp,
  skillName: string,
): Promise<SkillPackage> {
  const name = skillName.trim();
  if (!name) throw new Error('skillName required');

  // Content gives absolute path to SKILL.md
  const content = await http.getJson<SkillContentResponse>(
    `/api/skills/content?name=${encodeURIComponent(name)}`,
  );
  if (!content?.path || !content.content) {
    throw new Error(`skill content missing path for "${name}"`);
  }
  const skillMdPath = content.path;
  const skillRoot = skillMdPath.replace(/[/\\]SKILL\.md$/i, '');
  if (!skillRoot || skillRoot === skillMdPath) {
    throw new Error(`cannot derive skill root from ${skillMdPath}`);
  }

  // Optional category from list
  let category: string | undefined;
  try {
    const list = await http.getJson<Array<{ name?: string; category?: string }>>('/api/skills');
    const arr = Array.isArray(list) ? list : [];
    const hit = arr.find((s) => s.name === name);
    if (hit?.category) category = hit.category;
  } catch {
    /* list optional */
  }

  const absFiles = await walkFiles(http, skillRoot);
  if (absFiles.length === 0) {
    // at least skill md
    absFiles.push(skillMdPath);
  }
  if (absFiles.length > MAX_FILES) {
    throw new Error(`too many files in skill (>${MAX_FILES})`);
  }

  const files: SkillPackageFile[] = [];
  let totalBytes = 0;
  const skippedDenied: string[] = [];

  for (const abs of absFiles) {
    const relRaw = toPosixRel(skillRoot, abs);
    if (relRaw === null) {
      throw new Error(`file outside skill root: ${abs}`);
    }
    const rel = normalizeRelPath(relRaw || 'SKILL.md');
    if (!rel) throw new Error(`bad relative path for ${abs}`);
    if (isDeniedBasename(rel)) {
      skippedDenied.push(rel);
      continue;
    }

    // Prefer SKILL.md from content API (full, not truncated preview)
    if (rel === 'SKILL.md' || rel.toLowerCase() === 'skill.md') {
      const bytes = Buffer.byteLength(content.content, 'utf8');
      if (bytes > MAX_FILE_BYTES) throw new Error('SKILL.md too large');
      totalBytes += bytes;
      if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('package too large');
      files.push({ relativePath: 'SKILL.md', content: content.content, encoding: 'utf-8' });
      continue;
    }

    const read = await http.getJson<FsReadTextResponse>(
      `/api/fs/read-text?path=${encodeURIComponent(abs)}`,
    );
    if (read.binary) {
      throw new Error(`binary file not supported in MVP: ${rel}`);
    }
    if (read.truncated) {
      throw new Error(`file truncated by fs/read-text (too large): ${rel}`);
    }
    const text = read.text ?? '';
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new Error(`file too large: ${rel}`);
    totalBytes += bytes;
    if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('package too large');
    files.push({ relativePath: rel, content: text, encoding: 'utf-8' });
  }

  if (!files.some((f) => f.relativePath === 'SKILL.md')) {
    throw new Error('SKILL.md missing after export');
  }
  if (skippedDenied.length && files.length === 1 && absFiles.length > 1 + skippedDenied.length) {
    // odd case
  }
  if (skippedDenied.length) {
    console.warn(`[skill-export] denied files skipped: ${skippedDenied.join(', ')}`);
  }

  // Completeness: non-denied files must all be present
  const expected = absFiles.filter((abs) => {
    const rel = toPosixRel(skillRoot, abs);
    if (rel === null) return false;
    const n = normalizeRelPath(rel || 'SKILL.md');
    return n && !isDeniedBasename(n);
  }).length;
  if (files.length < expected) {
    throw new Error(`incomplete export: got ${files.length} files, expected ${expected}`);
  }

  return {
    version: 1,
    name,
    category,
    source: { agentId: http.agent.id, profile: http.agent.profile },
    files,
    meta: {
      exportedAt: new Date().toISOString(),
      fileCount: files.length,
      totalBytes,
    },
  };
}

async function ensureDir(http: AgentHttp, absDir: string): Promise<void> {
  try {
    await http.postJson('/api/files/mkdir', { path: absDir });
  } catch (e) {
    // exists is ok
    if (e instanceof AgentHttpError && (e.status === 409 || e.status === 400)) return;
    // retry once ignore
  }
}

async function writeTextFile(http: AgentHttp, absPath: string, text: string): Promise<void> {
  await http.postJson('/api/fs/write-text', { path: absPath, content: text });
}

/** Best-effort delete skill root on target after failed create. */
export async function cleanupSkillOnTarget(http: AgentHttp, skillName: string): Promise<boolean> {
  try {
    const content = await http.getJson<SkillContentResponse>(
      `/api/skills/content?name=${encodeURIComponent(skillName)}`,
    );
    if (!content?.path) return false;
    const skillRoot = content.path.replace(/[/\\]SKILL\.md$/i, '');
    await http.deleteJson('/api/files', { path: skillRoot, recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function skillExists(http: AgentHttp, skillName: string): Promise<boolean> {
  try {
    await http.getJson(`/api/skills/content?name=${encodeURIComponent(skillName)}`);
    return true;
  } catch (e) {
    if (e instanceof AgentHttpError && e.status === 404) return false;
    // if list works
    try {
      const list = await http.getJson<Array<{ name?: string }>>('/api/skills');
      return Array.isArray(list) && list.some((s) => s.name === skillName);
    } catch {
      throw e;
    }
  }
}

export interface ImportResult {
  name: string;
  fileCount: number;
  skillRoot?: string;
  cleanedUp?: boolean;
  cleanupFailed?: boolean;
}

export async function importSkillPackage(
  http: AgentHttp,
  pkg: SkillPackage,
  nameOverride?: string,
): Promise<ImportResult> {
  const name = (nameOverride || pkg.name).trim();
  if (!name) throw new Error('import name required');

  if (await skillExists(http, name)) {
    throw new AgentHttpError(409, `skill already exists: ${name}`);
  }

  const skillMd = pkg.files.find(
    (f) => f.relativePath === 'SKILL.md' || f.relativePath.toLowerCase() === 'skill.md',
  );
  if (!skillMd) throw new Error('package missing SKILL.md');

  let created = false;
  let skillRoot: string | undefined;

  try {
    // Create skill shell (writes SKILL.md)
    await http.postJson('/api/skills', {
      name,
      content: skillMd.content,
      category: pkg.category ?? null,
      profile: http.agent.profile ?? null,
    });
    created = true;

    // Resolve root
    const content = await http.getJson<SkillContentResponse>(
      `/api/skills/content?name=${encodeURIComponent(name)}`,
    );
    if (!content?.path) throw new Error('cannot resolve skill path after create');
    skillRoot = content.path.replace(/[/\\]SKILL\.md$/i, '');

    // Write remaining files (ordered by path depth so we mkdir parents)
    const rest = pkg.files
      .filter((f) => f.relativePath !== 'SKILL.md' && f.relativePath.toLowerCase() !== 'skill.md')
      .slice()
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const f of rest) {
      if (f.encoding === 'base64') {
        throw new Error(`binary/base64 not supported in MVP: ${f.relativePath}`);
      }
      const abs = joinSkillPath(skillRoot, f.relativePath);
      const parent = abs.replace(/[/\\][^/\\]+$/, '');
      if (parent && parent !== abs) {
        await ensureDir(http, parent);
      }
      await writeTextFile(http, abs, f.content);
    }

    // Post-verify: count files under root
    const onDisk = await walkFiles(http, skillRoot);
    const expected = pkg.files.length;
    // onDisk may include only what we can list; require at least package size
    if (onDisk.length < expected) {
      throw new Error(`post-verify failed: disk has ${onDisk.length} files, package ${expected}`);
    }

    return { name, fileCount: pkg.files.length, skillRoot };
  } catch (e) {
    let cleanedUp = false;
    let cleanupFailed = false;
    if (created) {
      cleanedUp = await cleanupSkillOnTarget(http, name);
      cleanupFailed = !cleanedUp;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const err = new Error(msg) as Error & { cleanedUp?: boolean; cleanupFailed?: boolean };
    err.cleanedUp = cleanedUp;
    err.cleanupFailed = cleanupFailed;
    throw err;
  }
}

export function findAgent(agents: AgentTarget[], agentId: string): AgentTarget | undefined {
  return agents.find((a) => a.id === agentId);
}
