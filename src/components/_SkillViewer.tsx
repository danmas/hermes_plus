import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientFor } from '../api/client';
import { findContentMatches } from '../utils/_skillSearch';
import type { AgentTarget } from '../types/agent';

interface SkillViewerProps {
  agent: AgentTarget;
  skillName: string | null;
  /** In-skill search query (debounced from SkillList) */
  contentQuery?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** Подсветка совпадений query в content (простой substring). */
function HighlightedContent({ content, query }: { content: string; query: string }) {
  const matches = useMemo(() => findContentMatches(content, query), [content, query]);
  const firstRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [content, query, matches.length]);

  if (!query.trim() || matches.length === 0) {
    return <pre className="skill-content-pre">{content}</pre>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.index > cursor) {
      parts.push(<span key={`t-${i}`}>{content.slice(cursor, m.index)}</span>);
    }
    const slice = content.slice(m.index, m.index + m.length);
    parts.push(
      <mark
        key={`m-${i}`}
        ref={i === 0 ? firstRef : undefined}
        className="skill-content-mark"
      >
        {slice}
      </mark>,
    );
    cursor = m.index + m.length;
  });
  if (cursor < content.length) {
    parts.push(<span key="tail">{content.slice(cursor)}</span>);
  }
  return <pre className="skill-content-pre">{parts}</pre>;
}

export default function SkillViewer({
  agent,
  skillName,
  contentQuery = '',
  isCollapsed = false,
  onToggleCollapse,
}: SkillViewerProps) {
  const client = clientFor(agent);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['skill-content', agent.id, skillName ?? ''],
    queryFn: ({ signal }) => client.getSkillContent(skillName as string, { signal }),
    enabled: !!skillName,
    staleTime: 45_000,
  });

  if (isCollapsed) {
    return (
      <div className="pane collapsed" style={{ width: 50, minWidth: 50 }}>
        <div className="pane-header">
          <button className="toggle-collapse-btn" onClick={onToggleCollapse} title="Expand skill viewer">
            «
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane skill-viewer-pane" style={{ minWidth: 0, flex: 1 }}>
      <div className="pane-header">
        <span className="pane-title">
          📜 {skillName ? skillName : 'Skill'}
          {agent.profile ? <span className="skill-profile-tag"> · {agent.profile}</span> : null}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {skillName && (
            <button
              className="btn"
              style={{ padding: '4px 8px', fontSize: 12 }}
              onClick={() => refetch()}
              disabled={isFetching}
              title="Обновить content"
            >
              {isFetching ? '…' : '↻'}
            </button>
          )}
          {onToggleCollapse && (
            <button className="toggle-collapse-btn" onClick={onToggleCollapse} title="Collapse">
              »
            </button>
          )}
        </div>
      </div>

      <div className="pane-content skill-viewer-body">
        {!skillName && (
          <div className="search-hint">Выберите skill в списке слева</div>
        )}
        {skillName && isLoading && (
          <div className="search-hint">Загрузка SKILL.md…</div>
        )}
        {skillName && isError && (
          <div className="search-error">
            Ошибка: {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        {skillName && data && (
          <>
            {data.path && (
              <div className="skill-content-meta" title={data.path}>
                {data.path}
              </div>
            )}
            {contentQuery.trim() && (
              <div className="search-hint">
                Совпадений в тексте: {findContentMatches(data.content, contentQuery).length}
              </div>
            )}
            <HighlightedContent content={data.content || ''} query={contentQuery} />
          </>
        )}
      </div>
    </div>
  );
}
