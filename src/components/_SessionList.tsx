import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientFor } from '../api/client';
import type { AgentTarget } from '../types/agent';

interface SessionListProps {
  agent: AgentTarget;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const PAGE_SIZE = 15;

export default function SessionList({
  agent,
  selectedSessionId,
  onSelectSession,
  isCollapsed,
  onToggleCollapse,
}: SessionListProps) {
  const [offset, setOffset] = useState(0);
  const client = clientFor(agent);

  // Сбросить оффсет при переключении агента
  useEffect(() => {
    setOffset(0);
  }, [agent.id]);

  // Запрос списка сессий
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sessions', agent.id, offset],
    queryFn: () => client.getSessions({ limit: PAGE_SIZE, offset }),
    refetchInterval: 10_000, // периодически обновляем
  });

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;

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

  return (
    <div className={`pane ${isCollapsed ? 'collapsed' : ''}`} style={{ width: isCollapsed ? '50px' : '320px', minWidth: isCollapsed ? '50px' : '320px' }}>
      <div className="pane-header">
        {!isCollapsed && <span className="pane-title">📂 Sessions ({total})</span>}
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

      <div className="pane-content">
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

        {sessions.map((session) => {
          const isActive = selectedSessionId === session.id;
          const date = session.started_at 
            ? new Date(session.started_at).toLocaleDateString() 
            : '—';

          return (
            <div
              key={session.id}
              className={`session-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="session-title">{session.title || session.display_name || `Session ${session.id.slice(0,8)}`}</div>
              <div className="session-preview">{session.preview || 'Нет сообщений'}</div>
              <div className="session-footer">
                <span>💬 {session.message_count ?? 0} сообщений</span>
                <span>{date}</span>
              </div>
            </div>
          );
        })}

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
      </div>
    </div>
  );
}
