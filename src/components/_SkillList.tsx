import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientFor } from '../api/client';
import {
  filterSkills,
  isUserSkill,
  partitionSkills,
  searchFleetSkills,
  type FleetSkillHit,
} from '../utils/_skillSearch';
import type { AgentHealth } from '../hooks/useFleet';
import type { AgentTarget } from '../types/agent';
import type { HermesSkill } from '../types/hermes';

export type SkillSearchScope = 'skill' | 'agent' | 'fleet';

interface SkillListProps {
  agent: AgentTarget;
  agents: AgentTarget[];
  selectedSkillName: string | null;
  onSelectSkill: (name: string | null) => void;
  onSelectAgent: (id: string) => void;
  /** Debounced query для in-skill highlight в SkillViewer */
  onContentQueryChange: (q: string) => void;
  fleetHealth?: AgentHealth[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function skillKey(s: HermesSkill): string {
  return s.name || s.path || '';
}

function provenanceLabel(skill: HermesSkill): string {
  const p = (skill.provenance || '').toLowerCase();
  if (p === 'agent' || p === 'user' || p === 'local' || p === 'custom' || !p) {
    return 'user';
  }
  if (p === 'bundled') return 'bundled';
  if (p === 'hub') return 'hub';
  return p;
}

function SkillRow({
  skill,
  isActive,
  agentLabel,
  onSelect,
}: {
  skill: HermesSkill;
  isActive: boolean;
  agentLabel?: string;
  onSelect: () => void;
}) {
  const description =
    typeof skill.description === 'string' ? skill.description.trim() : '';
  const user = isUserSkill(skill);
  const prov = provenanceLabel(skill);

  return (
    <div
      className={`session-item skill-row ${user ? 'skill-row--user' : 'skill-row--stock'} ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      title={description || skill.path || skill.name}
    >
      <div className="session-title">
        {agentLabel && <span className="agent-badge">{agentLabel}</span>}
        {user ? (
          <span className="skill-origin-badge skill-origin-badge--user" title="Пользовательский skill">
            user
          </span>
        ) : (
          <span
            className="skill-origin-badge skill-origin-badge--stock"
            title={prov === 'hub' ? 'Skill Hub' : 'Из коробки (bundled)'}
          >
            {prov === 'hub' ? 'hub' : 'box'}
          </span>
        )}
        {skill.enabled === false && <span className="skill-disabled-badge">off</span>}
        {skill.name}
      </div>
      {description ? (
        <div className="skill-description">{description}</div>
      ) : (
        <div className="session-preview skill-description-empty">Нет description</div>
      )}
      <div className="session-footer">
        {skill.category && <span>{skill.category}</span>}
        {skill.provenance && <span>· {skill.provenance}</span>}
        {typeof skill.usage === 'number' && skill.usage > 0 && <span>⚡ {skill.usage}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title, count, variant }: { title: string; count: number; variant: 'user' | 'stock' }) {
  return (
    <div className={`skill-section-hdr skill-section-hdr--${variant}`}>
      <span>{title}</span>
      <span className="skill-section-count">{count}</span>
    </div>
  );
}

export default function SkillList({
  agent,
  agents,
  selectedSkillName,
  onSelectSkill,
  onSelectAgent,
  onContentQueryChange,
  fleetHealth,
  isCollapsed,
  onToggleCollapse,
}: SkillListProps) {
  const client = clientFor(agent);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SkillSearchScope>('agent');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setQuery('');
    setDebouncedQ('');
  }, [agent.id]);

  useEffect(() => {
    if (scope === 'skill' && debouncedQ) onContentQueryChange(debouncedQ);
    else onContentQueryChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, debouncedQ]);

  const searching = debouncedQ.length > 0;
  const hasSkill = !!selectedSkillName;

  const {
    data: skills,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['skills', agent.id],
    queryFn: ({ signal }) => client.getSkills({ signal }),
    refetchInterval: 30_000,
  });

  const list = skills ?? [];

  const displayParts = useMemo(() => {
    const base = searching && scope === 'agent' ? filterSkills(list, debouncedQ) : list;
    return partitionSkills(base);
  }, [list, searching, scope, debouncedQ]);

  const displayCount = displayParts.user.length + displayParts.stock.length;

  const fleetTargets = useMemo(
    () =>
      agents.map((a) => ({
        agent: a,
        skip: fleetHealth?.find((h) => h.agent.id === a.id)?.status === 'offline',
      })),
    [agents, fleetHealth],
  );

  const fleetSearch = useQuery({
    queryKey: ['fleet-skill-search', debouncedQ, agents.map((a) => a.id).join(',')],
    queryFn: () => searchFleetSkills(fleetTargets, debouncedQ, { timeoutMs: 3000 }),
    enabled: searching && scope === 'fleet',
  });

  const fleetParts = useMemo(() => {
    const hits = fleetSearch.data?.hits ?? [];
    return {
      user: hits.filter((h) => isUserSkill(h)),
      stock: hits.filter((h) => !isUserSkill(h)),
    };
  }, [fleetSearch.data]);

  const scopeLabel =
    scope === 'skill'
      ? `в skill «${selectedSkillName ?? '…'}»`
      : scope === 'agent'
        ? `в «${agent.name}»${agent.profile ? ` · ${agent.profile}` : ''}`
        : `по флоту (${agents.length})`;

  const openSkill = (name: string) => onSelectSkill(name);

  const openFleetHit = (hit: FleetSkillHit) => {
    if (hit.agentId !== agent.id) onSelectAgent(hit.agentId);
    onSelectSkill(hit.name);
  };

  if (isCollapsed) {
    return (
      <div className={`pane collapsed`} style={{ width: 50, minWidth: 50 }}>
        <div className="pane-header">
          <button
            className="toggle-collapse-btn"
            onClick={onToggleCollapse}
            title="Expand Skills"
          >
            »
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane" style={{ width: 320, minWidth: 320 }}>
      <div className="pane-header">
        <span className="pane-title">
          ⚡ Skills ({searching && scope === 'agent' ? displayCount : list.length})
        </span>
        <button
          className="toggle-collapse-btn"
          onClick={onToggleCollapse}
          title="Collapse Skills Panel"
        >
          «
        </button>
      </div>

      <div className="search-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="scope-switch" role="tablist" aria-label="Область поиска skills">
          <button
            className={`scope-btn ${scope === 'skill' ? 'active' : ''}`}
            onClick={() => setScope('skill')}
            disabled={!hasSkill}
            title={hasSkill ? 'Поиск в тексте открытого skill' : 'Сначала выберите skill'}
          >
            Skill
          </button>
          <button
            className={`scope-btn ${scope === 'agent' ? 'active' : ''}`}
            onClick={() => setScope('agent')}
            title={`Фильтр skills «${agent.name}»`}
          >
            Agent
          </button>
          <button
            className={`scope-btn ${scope === 'fleet' ? 'active' : ''}`}
            onClick={() => setScope('fleet')}
            title="Поиск skills по всем агентам"
          >
            Fleet
          </button>
        </div>
        {searching && (
          <div className="search-hint" style={{ marginTop: 6 }}>
            {scope === 'agent' || scope === 'fleet'
              ? `Локальный filter · ${scopeLabel}`
              : `In-skill · ${scopeLabel}`}
          </div>
        )}
      </div>

      <div className="pane-content">
        {searching && scope === 'skill' && (
          <div className="search-hint">
            {hasSkill
              ? `Подсветка «${debouncedQ}» в открытом skill →`
              : 'Выберите skill'}
          </div>
        )}

        {searching && scope === 'fleet' && (
          <>
            {fleetSearch.isLoading && (
              <div className="search-hint">🔍 Ищем {scopeLabel}…</div>
            )}
            {fleetSearch.isError && (
              <div className="search-error">
                Ошибка fleet: {fleetSearch.error instanceof Error ? fleetSearch.error.message : String(fleetSearch.error)}
              </div>
            )}
            {!fleetSearch.isLoading && !fleetSearch.isError && fleetSearch.data && (
              <>
                {fleetSearch.data.errors.length > 0 && (
                  <div className="search-error">
                    {fleetSearch.data.errors.map((e) => (
                      <div key={e.agentId}>
                        ⚠ {e.agentName}: {e.error}
                      </div>
                    ))}
                    {fleetSearch.data.skipped.map((s) => (
                      <div key={s.agentId} className="search-hint">
                        ⊘ {s.agentName}: offline
                      </div>
                    ))}
                  </div>
                )}
                {fleetSearch.data.hits.length === 0 && fleetSearch.data.errors.length === 0 && (
                  <div className="search-hint">Ничего не найдено {scopeLabel}</div>
                )}
                {fleetParts.user.length > 0 && (
                  <>
                    <SectionHeader title="👤 Пользовательские" count={fleetParts.user.length} variant="user" />
                    {fleetParts.user.map((hit, i) => (
                      <SkillRow
                        key={`u-${hit.agentId}-${hit.name}-${i}`}
                        skill={hit}
                        isActive={hit.agentId === agent.id && selectedSkillName === hit.name}
                        agentLabel={hit.agentName}
                        onSelect={() => openFleetHit(hit)}
                      />
                    ))}
                  </>
                )}
                {fleetParts.stock.length > 0 && (
                  <>
                    <SectionHeader title="📦 Из коробки" count={fleetParts.stock.length} variant="stock" />
                    {fleetParts.stock.map((hit, i) => (
                      <SkillRow
                        key={`s-${hit.agentId}-${hit.name}-${i}`}
                        skill={hit}
                        isActive={hit.agentId === agent.id && selectedSkillName === hit.name}
                        agentLabel={hit.agentName}
                        onSelect={() => openFleetHit(hit)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {(!searching || scope === 'agent' || scope === 'skill') && (
          <>
            {isLoading && <div className="search-hint">Загрузка skills…</div>}
            {isError && (
              <div className="search-error">
                Ошибка: {error instanceof Error ? error.message : String(error)}
              </div>
            )}
            {!isLoading && !isError && searching && scope === 'agent' && displayCount === 0 && (
              <div className="search-hint">Ничего не найдено {scopeLabel}</div>
            )}
            {!isLoading && !isError && !searching && list.length === 0 && (
              <div className="search-hint">Нет skills на этом агенте</div>
            )}

            {!isLoading && !isError && displayParts.user.length > 0 && (
              <>
                <SectionHeader
                  title="👤 Пользовательские"
                  count={displayParts.user.length}
                  variant="user"
                />
                {displayParts.user.map((s) => (
                  <SkillRow
                    key={`u-${skillKey(s)}`}
                    skill={s}
                    isActive={selectedSkillName === s.name}
                    onSelect={() => openSkill(s.name)}
                  />
                ))}
              </>
            )}

            {!isLoading && !isError && displayParts.stock.length > 0 && (
              <>
                <SectionHeader
                  title="📦 Из коробки"
                  count={displayParts.stock.length}
                  variant="stock"
                />
                {displayParts.stock.map((s) => (
                  <SkillRow
                    key={`s-${skillKey(s)}`}
                    skill={s}
                    isActive={selectedSkillName === s.name}
                    onSelect={() => openSkill(s.name)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
