/**
 * Реестр агентов (fleet config).
 * Заполняется руками — см. KB/README_FLEET.md, модель AgentTarget.
 *
 * baseUrl='' означает same-origin: запрос идёт на Vite (5173), который
 * проксирует на 127.0.0.1:9119 (см. vite.config.ts). Это dev-режим.
 *
 * l1:default — LAN-агент 192.168.1.221 (см. KB/README_hermes_dashboard_221.md):
 * auth_required:true, basic auth. Креды ТОЛЬКО из env HERMES_L1_USERNAME /
 * HERMES_L1_PASSWORD — никогда литералами (см. openspec hermes-auth).
 */
import type { AgentTarget } from '../types/agent';

export const AGENTS: AgentTarget[] = [
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
