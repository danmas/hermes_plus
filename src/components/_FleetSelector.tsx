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
        {skillDrag?.dragging && !isCollapsed && (
          <div className="skill-drop-hint">
            Перетащите skill на агента для <strong>copy</strong>
            <div className="skill-drop-hint-name">«{skillDrag.dragging.skillName}»</div>
          </div>
        )}
        {agents.map((agent) => {
          const health = getHealth(agent.id);
          const isSelected = selectedAgentId === agent.id;
          const status = health?.status ?? 'offline';
          const isDropTarget =
            !!skillDrag?.dragging &&
            skillDrag.dragging.agentId !== agent.id &&
            skillDrag.dropHoverAgentId === agent.id;

          return (
            <div
              key={agent.id}
              className={`agent-card ${isSelected ? 'active' : ''} ${isDropTarget ? 'agent-card--drop' : ''} ${skillDrag?.dragging && skillDrag.dragging.agentId !== agent.id ? 'agent-card--droppable' : ''}`}
              onClick={() => onSelectAgent(agent.id)}
              onDragOver={(e) => {
                if (!skillDrag?.dragging || skillDrag.dragging.agentId === agent.id) return;
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
