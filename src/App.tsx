import { useEffect, useState } from 'react';
import './_index.css';
import { getAgents, getAgentsSync } from './config/agents';
import type { AgentTarget } from './types/agent';
import { useFleet } from './hooks/useFleet';
import FleetSelector from './components/_FleetSelector';
import SessionList, { type MessageFocus } from './components/_SessionList';
import ChatConsole from './components/_ChatConsole';
import SkillList from './components/_SkillList';
import SkillViewer from './components/_SkillViewer';

type MiddleMode = 'sessions' | 'skills';

export default function App() {
  // Auth-guard для prod-BFF (см. KB/README_SECURITY_PLANS.md): без сессии
  // /api/me → 401 → редирект на /login. В dev (Vite) /api/me не существует
  // (404) — guard пропускает UI как раньше.
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { headers: { Accept: 'application/json' } })
      .then((r) => {
        if (cancelled) return;
        if (r.status === 401) {
          window.location.replace('/login');
          return;
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Реестр агентов: сначала синхронный fallback, затем async-загрузка из
  // agents-config.json (middleware /api/agents). Редактируйте JSON, не этот код.
  const [agents, setAgents] = useState<AgentTarget[]>(() => getAgentsSync());
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? '');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  // Session scope поиска: фокус на сообщении в ChatConsole
  const [messageFocus, setMessageFocus] = useState<MessageFocus | null>(null);
  // In-skill search highlight (debounced из SkillList)
  const [skillContentQuery, setSkillContentQuery] = useState('');
  const [middleMode, setMiddleMode] = useState<MiddleMode>('sessions');

  // Состояние сворачивания панелей
  const [isFleetCollapsed, setIsFleetCollapsed] = useState(false);
  const [isSessionsCollapsed, setIsSessionsCollapsed] = useState(false);
  const [isSkillsCollapsed, setIsSkillsCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAgents().then((loaded) => {
      if (cancelled) return;
      setAgents(loaded);
      setSelectedAgentId((prev) =>
        loaded.some((a) => a.id === prev) ? prev : loaded[0]?.id ?? '',
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: fleetHealth, isLoading, refetch } = useFleet(agents, { withCounts: true });

  const activeAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0];

  if (!authReady) {
    return <div className="app-container" />;
  }

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setSelectedSessionId(null);
    setSelectedSkillName(null);
    setMessageFocus(null);
    setSkillContentQuery('');
  };

  const handleSelectSession = (id: string | null) => {
    setSelectedSessionId(id);
    setMessageFocus(null);
  };

  return (
    <div className="app-container">
      <FleetSelector
        agents={agents}
        fleetHealth={fleetHealth}
        isLoading={isLoading}
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
        onRefetch={refetch}
        isCollapsed={isFleetCollapsed}
        onToggleCollapse={() => setIsFleetCollapsed(!isFleetCollapsed)}
      />

      {/* Middle: Sessions | Skills switcher + list */}
      <div className="middle-stack">
        <div className="middle-mode-switch" role="tablist" aria-label="Sessions or Skills">
          <button
            type="button"
            className={`middle-mode-btn ${middleMode === 'sessions' ? 'active' : ''}`}
            onClick={() => setMiddleMode('sessions')}
          >
            📂 Sessions
          </button>
          <button
            type="button"
            className={`middle-mode-btn ${middleMode === 'skills' ? 'active' : ''}`}
            onClick={() => setMiddleMode('skills')}
          >
            ⚡ Skills
          </button>
        </div>

        {activeAgent && middleMode === 'sessions' && (
          <SessionList
            key={`sessions-${activeAgent.id}`}
            agent={activeAgent}
            agents={agents}
            selectedSessionId={selectedSessionId}
            onSelectSession={handleSelectSession}
            onSelectAgent={handleSelectAgent}
            onFocusMessage={setMessageFocus}
            fleetHealth={fleetHealth}
            isCollapsed={isSessionsCollapsed}
            onToggleCollapse={() => setIsSessionsCollapsed(!isSessionsCollapsed)}
          />
        )}

        {activeAgent && middleMode === 'skills' && (
          <SkillList
            key={`skills-${activeAgent.id}`}
            agent={activeAgent}
            agents={agents}
            selectedSkillName={selectedSkillName}
            onSelectSkill={setSelectedSkillName}
            onSelectAgent={handleSelectAgent}
            onContentQueryChange={setSkillContentQuery}
            fleetHealth={fleetHealth}
            isCollapsed={isSkillsCollapsed}
            onToggleCollapse={() => setIsSkillsCollapsed(!isSkillsCollapsed)}
          />
        )}
      </div>

      {/* Right: Chat or Skill content */}
      {activeAgent && middleMode === 'sessions' && (
        <ChatConsole
          key={`chat-${activeAgent.id}`}
          agent={activeAgent}
          sessionId={selectedSessionId}
          onSessionCreated={handleSelectSession}
          focusMessage={messageFocus}
        />
      )}

      {activeAgent && middleMode === 'skills' && (
        <SkillViewer
          key={`skill-view-${activeAgent.id}`}
          agent={activeAgent}
          skillName={selectedSkillName}
          contentQuery={skillContentQuery}
        />
      )}
    </div>
  );
}
