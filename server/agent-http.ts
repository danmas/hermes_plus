/**
 * HTTP-клиент к одному Hermes-таргету (server-side auth).
 */
import type { AgentTarget } from '../src/types/agent';
import type { BffConfig } from './config';
import {
  ensureL1Login,
  ensureL254Login,
  invalidateLocalToken,
  localAuthHeaders,
  resetL1Jar,
  resetL254Jar,
  resetLocalJar,
} from './upstream';

export class AgentHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'AgentHttpError';
  }
}

export interface AgentHttp {
  agent: AgentTarget;
  getJson<T = unknown>(path: string): Promise<T>;
  postJson<T = unknown>(path: string, body: unknown): Promise<T>;
  deleteJson<T = unknown>(path: string, body: unknown): Promise<T>;
  request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown; text: string }>;
}

function profileQs(agent: AgentTarget, path: string): string {
  if (!agent.profile) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}profile=${encodeURIComponent(agent.profile)}`;
}

function errDetail(json: unknown, text: string, status: number): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (typeof o.detail === 'string') return o.detail;
    if (typeof o.error === 'string') return o.error;
  }
  return text.slice(0, 200) || `HTTP ${status}`;
}

/** Resolve origin + auth headers factory for an AgentTarget. */
export function createAgentHttp(cfg: BffConfig, agent: AgentTarget): AgentHttp {
  const proxy = (agent.proxyPath || '').replace(/\/$/, '');

  async function authHeaders(): Promise<{ origin: string; headers: Record<string, string> }> {
    if (proxy === '/l1' || agent.id.startsWith('l1:')) {
      const jar = await ensureL1Login(cfg);
      return {
        origin: cfg.l1Origin,
        headers: { Accept: 'application/json', Cookie: jar },
      };
    }
    if (proxy === '/l254' || agent.id.startsWith('l254:')) {
      const jar = await ensureL254Login(cfg);
      return {
        origin: cfg.l254Origin,
        headers: { Accept: 'application/json', Cookie: jar },
      };
    }
    const origin =
      agent.baseUrl && /^https?:\/\//i.test(agent.baseUrl)
        ? agent.baseUrl.replace(/\/$/, '')
        : cfg.localOrigin;
    const auth = await localAuthHeaders(cfg);
    return { origin, headers: { Accept: 'application/json', ...auth } };
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<{ status: number; json: unknown; text: string }> {
    const { origin, headers } = await authHeaders();
    const fullPath = path.startsWith('/') ? path : `/${path}`;
    const h: Record<string, string> = { ...headers };
    const init: RequestInit = { method, headers: h };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      h['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(origin + fullPath, init);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.status === 401 && retry) {
      if (proxy === '/l1' || agent.id.startsWith('l1:')) {
        resetL1Jar();
        return request(method, path, body, false);
      }
      if (proxy === '/l254' || agent.id.startsWith('l254:')) {
        resetL254Jar();
        return request(method, path, body, false);
      }
      invalidateLocalToken();
      resetLocalJar();
      return request(method, path, body, false);
    }
    return { status: res.status, json, text };
  }

  return {
    agent,
    async getJson<T>(path: string): Promise<T> {
      const r = await request('GET', profileQs(agent, path));
      if (r.status < 200 || r.status >= 300) {
        throw new AgentHttpError(r.status, errDetail(r.json, r.text, r.status), r.json);
      }
      return r.json as T;
    },
    async postJson<T>(path: string, body: unknown): Promise<T> {
      const r = await request('POST', profileQs(agent, path), body);
      if (r.status < 200 || r.status >= 300) {
        throw new AgentHttpError(r.status, errDetail(r.json, r.text, r.status), r.json);
      }
      return r.json as T;
    },
    async deleteJson<T>(path: string, body: unknown): Promise<T> {
      const r = await request('DELETE', profileQs(agent, path), body);
      if (r.status < 200 || r.status >= 300) {
        throw new AgentHttpError(r.status, errDetail(r.json, r.text, r.status), r.json);
      }
      return r.json as T;
    },
    request: (method, path, body) => request(method, profileQs(agent, path), body),
  };
}
