import { useState } from 'react';
import './_index.css';
import { AGENTS } from './config/agents';
import { useFleet } from './hooks/useFleet';
import FleetSelector from './components/_FleetSelector';
import SessionList from './components/_SessionList';
import ChatConsole from './components/_ChatConsole';

export default function App() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(AGENTS[0]?.id ?? '');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  // Состояние сворачивания панелей
  const [isFleetCollapsed, setIsFleetCollapsed] = useState(false);
  const [isSessionsCollapsed, setIsSessionsCollapsed] = useState(false);

  // Опрос fleet раз в 30 секунд
  const { data: fleetHealth, isLoading, refetch } = useFleet(AGENTS, { withCounts: true });

  const activeAgent = AGENTS.find((a) => a.id === selectedAgentId) ?? AGENTS[0];

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setSelectedSessionId(null); // сбрасываем сессию при смене агента
  };

  return (
    <div className="app-container">
      {/* 1. Fleet & Health Selector */}
      <FleetSelector
        agents={AGENTS}
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
          key={activeAgent.id}
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
          key={`${activeAgent.id}-${selectedSessionId}`}
          agent={activeAgent}
          sessionId={selectedSessionId}
          onSessionCreated={setSelectedSessionId}
        />
      )}
    </div>
  );
}

