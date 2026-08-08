import { useEffect, useState } from 'react';
import './_index.css';
import { getAgents, getAgentsSync } from './config/agents';
import type { AgentTarget } from './types/agent';
import { useFleet } from './hooks/useFleet';
import FleetSelector from './components/_FleetSelector';
import SessionList from './components/_SessionList';
import ChatConsole from './components/_ChatConsole';

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

  // Состояние сворачивания панелей
  const [isFleetCollapsed, setIsFleetCollapsed] = useState(false);
  const [isSessionsCollapsed, setIsSessionsCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAgents().then((loaded) => {
      if (cancelled) return;
      setAgents(loaded);
      // если выбранного агента нет в загруженном списке — выбрать первый
      setSelectedAgentId((prev) =>
        loaded.some((a) => a.id === prev) ? prev : loaded[0]?.id ?? '',
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Опрос fleet раз в 30 секунд
  const { data: fleetHealth, isLoading, refetch } = useFleet(agents, { withCounts: true });

  const activeAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0];

  // До проверки авторизации UI не рендерим (иначе prod-BFF вернёт 401 на все запросы)
  if (!authReady) {
    return <div className="app-container" />;
  }

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setSelectedSessionId(null); // сбрасываем сессию при смене агента
  };

  return (
    <div className="app-container">
      {/* 1. Fleet & Health Selector */}
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

      {/* 2. Sessions Explorer */}
      {activeAgent && (
        <SessionList
          key={`sessions-${activeAgent.id}`}
          agent={activeAgent}
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
          isCollapsed={isSessionsCollapsed}
          onToggleCollapse={() => setIsSessionsCollapsed(!isSessionsCollapsed)}
        />
      )}

      {/* 3. Chat & Console */}
      {activeAgent && (
        <ChatConsole
          key={`chat-${activeAgent.id}`}
          agent={activeAgent}
          sessionId={selectedSessionId}
          onSessionCreated={setSelectedSessionId}
        />
      )}
    </div>
  );
}

