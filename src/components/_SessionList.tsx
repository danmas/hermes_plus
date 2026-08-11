import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientFor } from '../api/client';
import { formatBytes, sessionPayloadSize, type SessionPayloadStats } from '../utils/_sessionSize';
import { formatSessionWhen, sortSessionsNewestFirst } from '../utils/_sessionDates';
import { parseSnippet, searchFleetSessions, type FleetSearchHit } from '../utils/_sessionSearch';
import type { AgentHealth } from '../hooks/useFleet';
import type { AgentTarget } from '../types/agent';
import type { HermesSession, HermesSessionMessage, SessionMessagesResponse, SessionSearchHit } from '../types/hermes';

export type SearchScope = 'session' | 'agent' | 'fleet';

/** Фокус на сообщении в ChatConsole (Session scope: клик по совпадению). */
export interface MessageFocus {
  index: number;
  query: string;
}

interface SessionListProps {
  agent: AgentTarget;
  /** Весь реестр агентов — для Fleet scope */
  agents: AgentTarget[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  /** Fleet scope: клик по хиту другого агента переключает активный таргет */
  onSelectAgent: (id: string) => void;
  /** Session scope: скролл/подсветка сообщения в ChatConsole */
  onFocusMessage: (focus: MessageFocus | null) => void;
  /** Известное состояние fleet — offline-таргеты пропускаем без запроса */
  fleetHealth?: AgentHealth[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const PAGE_SIZE = 15;
/** Максимум отображаемых совпадений Session scope (design.md: cap highlight count) */
const MAX_SESSION_MATCHES = 200;

// ── Вспомогательные рендеры ──────────────────────────────────────────────────

/** Snippet из FTS-ответа с маркерами `>>>match<<<` → подсветка <mark> */
function SnippetView({ snippet }: { snippet?: string }) {
  const parts = parseSnippet(snippet);
  if (parts.length === 0) return null;
  return (
    <div className="search-snippet">
      {parts.map((p, i) =>
        p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </div>
  );
}

interface SearchHitCardProps {
  hit: SessionSearchHit;
  /** Метка агента (Fleet scope) */
  agentLabel?: string;
  onSelect: () => void;
}

function SearchHitCard({ hit, agentLabel, onSelect }: SearchHitCardProps) {
  const when = formatSessionWhen(hit.started_at, hit.ended_at);
  const sessionId = hit.session_id ?? hit.id;
  return (
    <div className="session-item search-hit" onClick={onSelect}>
      <div className="session-title">
        {agentLabel && <span className="agent-badge">{agentLabel}</span>}
        {hit.title || `Session ${String(sessionId).slice(0, 8)}`}
      </div>
      <SnippetView snippet={hit.snippet} />
      {!hit.snippet && <div className="session-preview">{hit.preview || 'Нет превью'}</div>}
      <div className="session-footer">
        {hit.role && <span>{hit.role}</span>}
        {hit.source && <span>· {hit.source}</span>}
        {typeof hit.message_count === 'number' && <span>💬 {hit.message_count}</span>}
        <span title={when.title}>{when.label}</span>
      </div>
    </div>
  );
}

// ── Список сессий ─────────────────────────────────────────────────────────────

interface SessionListItemProps {
  session: HermesSession;
  agentId: string;
  isActive: boolean;
  onSelect: () => void;
}

function SessionListItem({ session, agentId, isActive, onSelect }: SessionListItemProps) {
  const queryClient = useQueryClient();

  // Реактивная подписка на кэш размера (без сетевых запросов)
  const { data: cachedStats } = useQuery<SessionPayloadStats | null>({
    queryKey: ['session-size', agentId, session.id],
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  });

  const when = formatSessionWhen(session.started_at, session.ended_at);

  // 1. Прямой размер из DTO сервера (если есть)
  let displayBytes: number | null = typeof session.bytes === 'number' && session.bytes > 0 ? session.bytes : null;
  let displayTokens: number | null = typeof session.total_tokens === 'number' && session.total_tokens > 0 ? session.total_tokens : null;

  // 2. Размер из кэша уже открытых сессий (Вариант 1)
  if (!displayBytes && cachedStats?.bytes) {
    displayBytes = cachedStats.bytes;
  } else if (!displayBytes) {
    const cachedMessages = queryClient.getQueryData<SessionMessagesResponse>(['messages', agentId, session.id]);
    if (cachedMessages?.messages?.length) {
      const computed = sessionPayloadSize(cachedMessages.messages);
      displayBytes = computed.bytes;
    }
  }

  if (!displayTokens && cachedStats?.approxTokens) {
    displayTokens = cachedStats.approxTokens;
  }

  return (
    <div
      className={`session-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <div className="session-title">{session.title || session.display_name || `Session ${session.id.slice(0, 8)}`}</div>
      <div className="session-preview">{session.preview || 'Нет сообщений'}</div>
      <div className="session-footer">
        <span>💬 {session.message_count ?? 0} сообщ.</span>
        {displayBytes !== null && (
          <span className="session-size-badge" title={`Размер payload: ${displayBytes.toLocaleString()} байт`}>
            📦 {formatBytes(displayBytes)}
          </span>
        )}
        {displayTokens !== null && (
          <span className="session-size-badge" title="Ориентировочное число токенов">
            ⚡ {displayTokens.toLocaleString()} tok
          </span>
        )}
        <span title={when.title}>{when.label}</span>
      </div>
    </div>
  );
}

export default function SessionList({
  agent,
  agents,
  selectedSessionId,
  onSelectSession,
  onSelectAgent,
  onFocusMessage,
  fleetHealth,
  isCollapsed,
  onToggleCollapse,
}: SessionListProps) {
  const [offset, setOffset] = useState(0);
  const client = clientFor(agent);

  // ── Поиск: состояние ──
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('agent');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Debounce ~300 мс (design.md D2); устаревшие запросы отменяет TanStack Query
  // через signal в queryFn (AbortController проброшен в клиент).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debouncedQ.length > 0;
  const realSessionId = selectedSessionId && selectedSessionId !== 'new' ? selectedSessionId : null;

  // Сбросить оффсет при переключении агента; поиск — при смене агента
  useEffect(() => {
    setOffset(0);
    setQuery('');
    setDebouncedQ('');
  }, [agent.id]);

  // Фокус сообщения актуален только пока жив Session-поиск
  useEffect(() => {
    if (!searching || scope !== 'session') onFocusMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, scope, debouncedQ, realSessionId]);

  // ── Обычный список сессий ──
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sessions', agent.id, offset],
    queryFn: () => client.getSessions({ limit: PAGE_SIZE, offset }),
    refetchInterval: 10_000, // периодически обновляем
  });

  const rawSessions = data?.sessions ?? [];
  const sessions = useMemo(() => sortSessionsNewestFirst(rawSessions), [rawSessions]);
  const total = data?.total ?? 0;

  // ── Scope: Agent — FTS на текущем таргете ──
  const agentSearch = useQuery({
    queryKey: ['session-search', agent.id, debouncedQ],
    queryFn: ({ signal }) => client.searchSessions(debouncedQ, { signal }),
    enabled: searching && scope === 'agent',
  });

  // ── Scope: Fleet — fan-out по реестру ──
  const fleetTargets = useMemo(
    () =>
      agents.map((a) => ({
        agent: a,
        // offline известен из health → не тратим 3 с таймаута (design.md D3)
        skip: fleetHealth?.find((h) => h.agent.id === a.id)?.status === 'offline',
      })),
    [agents, fleetHealth],
  );
  const fleetSearch = useQuery({
    queryKey: ['fleet-session-search', debouncedQ, agents.map((a) => a.id).join(',')],
    queryFn: () => searchFleetSessions(fleetTargets, debouncedQ, { timeoutMs: 3000 }),
    enabled: searching && scope === 'fleet',
  });

  // ── Scope: Session — фильтр загруженных сообщений выбранной сессии ──
  // Сообщения берутся из общего кэша ['messages', agent.id, id] (тот же ключ,
  // что у ChatConsole) — повторного запроса нет, если сессия уже открыта.
  const sessionSearchEnabled = searching && scope === 'session' && !!realSessionId;
  const {
    data: sessionMsgs,
    isLoading: msgsLoading,
    isError: msgsError,
  } = useQuery({
    queryKey: ['messages', agent.id, realSessionId ?? ''],
    queryFn: () => client.getSessionMessages(realSessionId as string),
    enabled: sessionSearchEnabled,
  });

  const sessionMatches = useMemo(() => {
    if (!sessionSearchEnabled || !sessionMsgs?.messages) return [];
    const needle = debouncedQ.toLowerCase();
    const out: Array<{ index: number; msg: HermesSessionMessage }> = [];
    sessionMsgs.messages.forEach((msg, index) => {
      const content = (msg.content ?? '').toLowerCase();
      const tools = msg.tool_calls ? JSON.stringify(msg.tool_calls).toLowerCase() : '';
      if (content.includes(needle) || tools.includes(needle)) out.push({ index, msg });
    });
    return out;
  }, [sessionSearchEnabled, sessionMsgs, debouncedQ]);

  // ── Обработчики ──
  const handleNextPage = () => {
    if (offset + PAGE_SIZE < total) {
      setOffset((prev) => prev + PAGE_SIZE);
    }
  };

  const handlePrevPage = () => {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
  };

  const handleCreateSession = () => {
    onSelectSession('new');
  };

  const openHit = (hit: SessionSearchHit) => {
    onSelectSession(hit.session_id ?? hit.id);
  };

  const openFleetHit = (hit: FleetSearchHit) => {
    if (hit.agentId !== agent.id) onSelectAgent(hit.agentId);
    onSelectSession(hit.session_id ?? hit.id);
  };

  // Текст-индикатор активного scope (пустые/загрузочные состояния)
  const scopeLabel =
    scope === 'session'
      ? `в сессии ${realSessionId ? realSessionId.slice(0, 12) : '…'}`
      : scope === 'agent'
        ? `в «${agent.name}»${agent.profile ? ` · ${agent.profile}` : ''}`
        : `по всему флоту (${agents.length} агентов)`;

  const excerptAroundMatch = (msg: HermesSessionMessage, needle: string): string => {
    const text = msg.content ?? (msg.tool_calls ? JSON.stringify(msg.tool_calls) : '');
    const i = text.toLowerCase().indexOf(needle);
    if (i === -1) return text.slice(0, 120);
    const start = Math.max(0, i - 60);
    const end = Math.min(text.length, i + needle.length + 60);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  };

  return (
    <div className={`pane ${isCollapsed ? 'collapsed' : ''}`} style={{ width: isCollapsed ? '50px' : '320px', minWidth: isCollapsed ? '50px' : '320px' }}>
      <div className="pane-header">
        {!isCollapsed && <span className="pane-title">📂 Sessions ({searching ? '🔍' : total})</span>}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!isCollapsed && (
            <button className="btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={handleCreateSession}>
              + New
            </button>
          )}
          <button className="toggle-collapse-btn" onClick={onToggleCollapse} title={isCollapsed ? "Expand Sessions Panel" : "Collapse Sessions Panel"}>
            {isCollapsed ? '»' : '«'}
          </button>
        </div>
      </div>

      {/* Поиск: единый input + переключатель scope (openspec sessions-search, D4) */}
      {!isCollapsed && (
        <div className="search-controls">
          <input
            type="text"
            className="search-input"
            placeholder="Поиск по сессиям…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="scope-switch" role="tablist" aria-label="Область поиска">
            <button
              className={`scope-btn ${scope === 'session' ? 'active' : ''}`}
              onClick={() => setScope('session')}
              disabled={!realSessionId}
              title={realSessionId ? 'Поиск в сообщениях открытой сессии' : 'Сначала выберите сохранённую сессию'}
            >
              Session
            </button>
            <button
              className={`scope-btn ${scope === 'agent' ? 'active' : ''}`}
              onClick={() => setScope('agent')}
              title={`FTS-поиск по всем сессиям «${agent.name}»`}
            >
              Agent
            </button>
            <button
              className={`scope-btn ${scope === 'fleet' ? 'active' : ''}`}
              onClick={() => setScope('fleet')}
              title="FTS-поиск по всем агентам реестра"
            >
              Fleet
            </button>
          </div>
        </div>
      )}

      <div className="pane-content">
        {/* ── Режим поиска ── */}
        {searching && scope === 'agent' && (
          <>
            {agentSearch.isLoading && (
              <div className="search-hint">🔍 Ищем {scopeLabel}…</div>
            )}
            {agentSearch.isError && (
              <div className="search-error">
                Ошибка поиска {scopeLabel}: {agentSearch.error instanceof Error ? agentSearch.error.message : String(agentSearch.error)}
              </div>
            )}
            {!agentSearch.isLoading && !agentSearch.isError && (agentSearch.data?.results?.length ?? 0) === 0 && (
              <div className="search-hint">Ничего не найдено {scopeLabel}</div>
            )}
            {(agentSearch.data?.results ?? []).map((hit, i) => (
              <SearchHitCard key={`${hit.id}-${i}`} hit={hit} onSelect={() => openHit(hit)} />
            ))}
          </>
        )}

        {searching && scope === 'fleet' && (
          <>
            {fleetSearch.isLoading && (
              <div className="search-hint">🔍 Ищем {scopeLabel}…</div>
            )}
            {fleetSearch.isError && (
              <div className="search-error">
                Ошибка fleet-поиска: {fleetSearch.error instanceof Error ? fleetSearch.error.message : String(fleetSearch.error)}
              </div>
            )}
            {!fleetSearch.isLoading && !fleetSearch.isError && fleetSearch.data && (
              <>
                {fleetSearch.data.errors.length > 0 && (
                  <div className="search-error">
                    {fleetSearch.data.errors.map((e) => (
                      <div key={e.agentId}>⚠ {e.agentName}: {e.error}</div>
                    ))}
                    {fleetSearch.data.skipped.map((s) => (
                      <div key={s.agentId} className="search-hint">⊘ {s.agentName}: пропущен (offline)</div>
                    ))}
                  </div>
                )}
                {fleetSearch.data.hits.length === 0 && fleetSearch.data.errors.length === 0 && (
                  <div className="search-hint">Ничего не найдено {scopeLabel}</div>
                )}
                {fleetSearch.data.hits.map((hit, i) => (
                  <SearchHitCard
                    key={`${hit.agentId}-${hit.id}-${i}`}
                    hit={hit}
                    agentLabel={hit.agentName}
                    onSelect={() => openFleetHit(hit)}
                  />
                ))}
              </>
            )}
          </>
        )}

        {searching && scope === 'session' && (
          <>
            {msgsLoading && <div className="search-hint">🔍 Ищем {scopeLabel}…</div>}
            {msgsError && (
              <div className="search-error">Не удалось загрузить сообщения сессии — поиск невозможен</div>
            )}
            {!msgsLoading && !msgsError && sessionMsgs && (
              <>
                <div className="search-hint">
                  {sessionMatches.length > 0
                    ? `Найдено ${sessionMatches.length} в ${sessionMsgs.messages.length} сообщениях`
                    : `Ничего не найдено в ${sessionMsgs.messages.length} сообщениях`}
                </div>
                {sessionMatches.slice(0, MAX_SESSION_MATCHES).map(({ index, msg }) => (
                  <div
                    key={index}
                    className="session-item search-hit"
                    onClick={() => onFocusMessage({ index, query: debouncedQ })}
                    title="Показать сообщение в чате"
                  >
                    <div className="session-title" style={{ fontSize: 12 }}>
                      #{index + 1} · {msg.role}
                    </div>
                    <div className="session-preview">{excerptAroundMatch(msg, debouncedQ.toLowerCase())}</div>
                  </div>
                ))}
                {sessionMatches.length > MAX_SESSION_MATCHES && (
                  <div className="search-hint">…показаны первые {MAX_SESSION_MATCHES}</div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Обычный режим списка ── */}
        {!searching && (
          <>
            {selectedSessionId === 'new' && (
              <div className="session-item active" style={{ borderLeft: '3px solid var(--accent-primary)', background: 'rgba(59, 130, 246, 0.15)' }}>
                <div className="session-title">✨ Новая сессия</div>
                <div className="session-preview">Черновик — напишите сообщение для старта</div>
              </div>
            )}

            {isLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка сессий...</div>}
            {isError && <div style={{ color: 'var(--status-offline)' }}>Ошибка загрузки сессий</div>}

            {!isLoading && !isError && sessions.length === 0 && selectedSessionId !== 'new' && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                Сессий не найдено. Начните новый чат!
              </div>
            )}

            {sessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                agentId={agent.id}
                isActive={selectedSessionId === session.id}
                onSelect={() => onSelectSession(session.id)}
              />
            ))}

            {total > PAGE_SIZE && (
              <div className="pagination">
                <button
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                >
                  Back
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} из {total}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={handleNextPage}
                  disabled={offset + PAGE_SIZE >= total}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
