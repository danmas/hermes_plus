import type { AgentHealth } from '../hooks/useFleet';
import type { AgentTarget } from '../types/agent';

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
  // Найти здоровье по id
  const getHealth = (id: string): AgentHealth | undefined => {
    return fleetHealth?.find((h) => h.agent.id === id);
  };

  return (
    <div className={`pane ${isCollapsed ? 'collapsed' : ''}`} style={{ width: isCollapsed ? '50px' : '280px', minWidth: isCollapsed ? '50px' : '280px' }}>
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
          <button className="toggle-collapse-btn" onClick={onToggleCollapse} title={isCollapsed ? "Expand Fleet Panel" : "Collapse Fleet Panel"}>
            {isCollapsed ? '»' : '«'}
          </button>
        </div>
      </div>
      <div className="pane-content">
        {agents.map((agent) => {
          const health = getHealth(agent.id);
          const isSelected = selectedAgentId === agent.id;
          const status = health?.status ?? 'offline';

          return (
            <div
              key={agent.id}
              className={`agent-card ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectAgent(agent.id)}
            >
              <div className="agent-card-title">
                <span style={{ fontWeight: 600 }}>{agent.name}</span>
                <span className={`status-dot ${status}`} title={status} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {agent.profile ? `profile: ${agent.profile}` : 'profile: default'}
                {health?.info?.version && ` • v${health.info.version}`}
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(agent.tags ?? []).map((t) => (
                  <span key={t} className="tag">{t}</span>
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
}
