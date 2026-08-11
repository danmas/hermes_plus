/**
 * SkillPackage v1 — канонический пакет copy skill (openspec skills-copy-dnd).
 */
export const SKILL_PACKAGE_VERSION = 1 as const;

export type SkillFileEncoding = 'utf-8' | 'base64';

export interface SkillPackageFile {
  relativePath: string;
  content: string;
  encoding: SkillFileEncoding;
}

export interface SkillPackage {
  version: typeof SKILL_PACKAGE_VERSION;
  name: string;
  category?: string;
  source: { agentId: string; profile?: string };
  files: SkillPackageFile[];
  meta?: { exportedAt: string; fileCount: number; totalBytes: number };
}

/** Лимиты (согласованы с Hermes fs caps, с запасом для BFF memory). */
export const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 1 * 1024 * 1024;
export const MAX_FILES = 200;

const DENY_BASENAMES = new Set(
  [
    '.env',
    '.env.local',
    '.env.production',
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    'credentials.json',
    'secrets.json',
    '.npmrc',
    '.netrc',
  ].map((s) => s.toLowerCase()),
);

const DENY_SUFFIXES = ['.pem', '.key', '.p12', '.pfx'];

export function isDeniedBasename(name: string): boolean {
  const base = name.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  if (DENY_BASENAMES.has(base)) return true;
  return DENY_SUFFIXES.some((s) => base.endsWith(s));
}

/** Normalize to posix relative path; reject traversal. */
export function normalizeRelPath(raw: string): string | null {
  let p = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.includes('\0')) return null;
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split('/').filter((x) => x && x !== '.');
  if (parts.some((x) => x === '..')) return null;
  return parts.join('/');
}

export function validatePackage(pkg: unknown): { ok: true; package: SkillPackage } | { ok: false; error: string } {
  if (!pkg || typeof pkg !== 'object') return { ok: false, error: 'package must be an object' };
  const o = pkg as Record<string, unknown>;
  if (o.version !== 1) return { ok: false, error: 'unsupported package version' };
  if (typeof o.name !== 'string' || !o.name.trim()) return { ok: false, error: 'package.name required' };
  if (!Array.isArray(o.files) || o.files.length === 0) return { ok: false, error: 'package.files empty' };
  if (o.files.length > MAX_FILES) return { ok: false, error: `too many files (>${MAX_FILES})` };

  const files: SkillPackageFile[] = [];
  let total = 0;
  let hasSkillMd = false;

  for (const f of o.files) {
    if (!f || typeof f !== 'object') return { ok: false, error: 'invalid file entry' };
    const fe = f as Record<string, unknown>;
    const rel = typeof fe.relativePath === 'string' ? normalizeRelPath(fe.relativePath) : null;
    if (!rel) return { ok: false, error: `unsafe relativePath: ${String(fe.relativePath)}` };
    if (isDeniedBasename(rel)) return { ok: false, error: `denied file: ${rel}` };
    const encoding = fe.encoding === 'base64' ? 'base64' : 'utf-8';
    if (typeof fe.content !== 'string') return { ok: false, error: `missing content: ${rel}` };
    const byteLen =
      encoding === 'base64'
        ? Math.floor((fe.content.length * 3) / 4)
        : Buffer.byteLength(fe.content, 'utf8');
    if (byteLen > MAX_FILE_BYTES) return { ok: false, error: `file too large: ${rel}` };
    total += byteLen;
    if (total > MAX_PACKAGE_BYTES) return { ok: false, error: 'package too large' };
    if (rel === 'SKILL.md' || rel.toLowerCase() === 'skill.md') hasSkillMd = true;
    files.push({ relativePath: rel, content: fe.content, encoding });
  }

  if (!hasSkillMd) return { ok: false, error: 'SKILL.md required in package' };

  const source =
    o.source && typeof o.source === 'object'
      ? (o.source as SkillPackage['source'])
      : { agentId: 'unknown' };

  return {
    ok: true,
    package: {
      version: 1,
      name: String(o.name).trim(),
      category: typeof o.category === 'string' ? o.category : undefined,
      source: {
        agentId: typeof source.agentId === 'string' ? source.agentId : 'unknown',
        profile: typeof source.profile === 'string' ? source.profile : undefined,
      },
      files,
      meta:
        o.meta && typeof o.meta === 'object'
          ? (o.meta as SkillPackage['meta'])
          : { exportedAt: new Date().toISOString(), fileCount: files.length, totalBytes: total },
    },
  };
}

export function joinSkillPath(root: string, rel: string): string {
  const r = root.replace(/[/\\]+$/, '');
  const sep = r.includes('\\') ? '\\' : '/';
  return r + sep + rel.replace(/\//g, sep);
}

export function toPosixRel(fromRoot: string, absPath: string): string | null {
  const a = fromRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const b = absPath.replace(/\\/g, '/');
  if (b === a) return '';
  const prefix = a.endsWith('/') ? a : a + '/';
  if (!b.startsWith(prefix) && b.toLowerCase() !== a.toLowerCase()) {
    // case-insensitive Windows
    if (!b.toLowerCase().startsWith(prefix.toLowerCase())) return null;
    return b.slice(prefix.length);
  }
  return b.slice(prefix.length);
}
