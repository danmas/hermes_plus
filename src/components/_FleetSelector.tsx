import { useMemo } from 'react';
import type { AgentHealth } from '../hooks/useFleet';
import type { AgentTarget } from '../types/agent';
import { useSkillDragOptional } from './_SkillDragContext';

interface FleetSelectorProps {
  agents: AgentTarget[];
  fleetHealth: AgentHealth[] | undefined;
  isLoading: boolean;
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  onRefetch: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface HostGroup {
  hostKey: string;
  hostName: string;
  icon: string;
  agents: AgentTarget[];
}

export default function FleetSelector({
  agents,
  fleetHealth,
  isLoading,
  selectedAgentId,
  onSelectAgent,
  onRefetch,
  isCollapsed,
  onToggleCollapse,
}: FleetSelectorProps) {
  const skillDrag = useSkillDragOptional();

  // Найти здоровье по id
  const getHealth = (id: string): AgentHealth | undefined => {
    return fleetHealth?.find((h) => h.agent.id === id);
  };

  // Группировка агентов по хостам (машинам)
  const groups = useMemo(() => {
    const map = new Map<string, HostGroup>();

    for (const agent of agents) {
      const isLocal =
        !agent.proxyPath &&
        (!agent.baseUrl ||
          agent.baseUrl.includes('127.0.0.1') ||
          agent.baseUrl.includes('localhost'));
      const hostKey =
        agent.proxyPath ||
        (agent.baseUrl ? new URL(agent.baseUrl).host : 'local');

      // Извлекаем имя хоста (часть до '/')
      const parts = agent.name.split('/');
      const rawHostName = parts[0]?.trim();
      const hostName =
        rawHostName || (isLocal ? 'Local Hermes' : 'Remote Host');

      if (!map.has(hostKey)) {
        map.set(hostKey, {
          hostKey,
          hostName,
          icon: isLocal ? '💻' : '📡',
          agents: [],
        });
      }
      map.get(hostKey)!.agents.push(agent);
    }

    return Array.from(map.values());
  }, [agents]);

  return (
    <div
      className={`pane ${isCollapsed ? 'collapsed' : ''}`}
      style={{
        width: isCollapsed ? '50px' : '280px',
        minWidth: isCollapsed ? '50px' : '280px',
      }}
    >
      <div className="pane-header">
        {!isCollapsed && <span className="pane-title">🌐 Hermes Fleet</span>}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!isCollapsed && (
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11px' }}
              onClick={onRefetch}
              disabled={isLoading}
            >
              {isLoading ? '...' : 'Sync'}
            </button>
          )}
          <button
            className="toggle-collapse-btn"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand Fleet Panel' : 'Collapse Fleet Panel'}
          >
            {isCollapsed ? '»' : '«'}
          </button>
        </div>
      </div>
      <div className="pane-content">
        {skillDrag?.dragging && !isCollapsed && (
          <div className="skill-drop-hint">
            Перетащите skill на агента для <strong>copy</strong>
            <div className="skill-drop-hint-name">
              «{skillDrag.dragging.skillName}»
            </div>
          </div>
        )}
        {groups.map((group) => {
          const hostOnlineCount = group.agents.filter(
            (a) => getHealth(a.id)?.status === 'online'
          ).length;
          const isHostOnline = hostOnlineCount > 0;

          if (isCollapsed) {
            return (
              <div key={group.hostKey} className="fleet-host-group--collapsed">
                <div className="fleet-host-icon-badge" title={group.hostName}>
                  {group.icon}
                </div>
                {group.agents.map((agent) => {
                  const health = getHealth(agent.id);
                  const isSelected = selectedAgentId === agent.id;
                  const status = health?.status ?? 'offline';
                  return (
                    <div
                      key={agent.id}
                      className={`agent-card agent-card--collapsed ${
                        isSelected ? 'active' : ''
                      }`}
                      onClick={() => onSelectAgent(agent.id)}
                      title={`${agent.name} (${status})`}
                    >
                      <span className={`status-dot ${status}`} />
                    </div>
                  );
                })}
              </div>
            );
          }

          return (
            <div key={group.hostKey} className="fleet-host-group">
              <div className="fleet-host-header">
                <div className="fleet-host-title">
                  <span className="fleet-host-icon">{group.icon}</span>
                  <span className="fleet-host-name">{group.hostName}</span>
                </div>
                <span
                  className={`status-dot ${isHostOnline ? 'online' : 'offline'}`}
                  title={
                    isHostOnline
                      ? `${hostOnlineCount} / ${group.agents.length} profiles online`
                      : 'Offline'
                  }
                />
              </div>

              <div className="fleet-host-profiles">
                {group.agents.map((agent) => {
                  const health = getHealth(agent.id);
                  const isSelected = selectedAgentId === agent.id;
                  const status = health?.status ?? 'offline';
                  const isDropTarget =
                    !!skillDrag?.dragging &&
                    skillDrag.dragging.agentId !== agent.id &&
                    skillDrag.dropHoverAgentId === agent.id;

                  const profileDisplayName =
                    agent.profile ||
                    (agent.name.includes('/')
                      ? agent.name.split('/')[1]?.trim()
                      : 'default');

                  return (
                    <div
                      key={agent.id}
                      className={`agent-card profile-card ${
                        isSelected ? 'active' : ''
                      } ${isDropTarget ? 'agent-card--drop' : ''} ${
                        skillDrag?.dragging &&
                        skillDrag.dragging.agentId !== agent.id
                          ? 'agent-card--droppable'
                          : ''
                      }`}
                      onClick={() => onSelectAgent(agent.id)}
                      onDragOver={(e) => {
                        if (
                          !skillDrag?.dragging ||
                          skillDrag.dragging.agentId === agent.id
                        )
                          return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        skillDrag.setDropHoverAgentId(agent.id);
                      }}
                      onDragLeave={() => {
                        if (skillDrag?.dropHoverAgentId === agent.id) {
                          skillDrag.setDropHoverAgentId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!skillDrag?.dragging || skillDrag.busy) return;
                        if (skillDrag.dragging.agentId === agent.id) return;
                        void skillDrag.handleDropOnAgent(agent.id, agent.name);
                      }}
                    >
                      <div className="agent-card-title">
                        <span className="profile-name">
                          👤 {profileDisplayName}
                        </span>
                        <span className={`status-dot ${status}`} title={status} />
                      </div>
                      <div className="profile-meta">
                        {health?.info?.version && `v${health.info.version}`}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          display: 'flex',
                          gap: 4,
                          flexWrap: 'wrap',
                        }}
                      >
                        {(agent.tags ?? []).map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </div>

                      <div className="agent-stats">
                        <span>⚡ Skills: {health?.skillsCount ?? '—'}</span>
                        <span>💬 Sessions: {health?.sessionsCount ?? '—'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
