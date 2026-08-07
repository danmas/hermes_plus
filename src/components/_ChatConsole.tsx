import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientFor } from '../api/client';
import { HermesWsClient } from '../api/ws';
import { formatBytes, sessionPayloadSize } from '../utils/_sessionSize';
import type { AgentTarget } from '../types/agent';
import type { HermesSessionMessage, SessionMessagesResponse } from '../types/hermes';

interface ChatConsoleProps {
  agent: AgentTarget;
  sessionId: string | null;
  onSessionCreated?: (newId: string) => void;
}

interface StreamingState {
  role: string;
  content: string;
  thinking?: string;
  tools?: Array<{ name: string; args?: unknown; output?: string; status: 'running' | 'done' }>;
}

export default function ChatConsole({ agent, sessionId, onSessionCreated }: ChatConsoleProps) {
  const [messages, setMessages] = useState<HermesSessionMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [streamingResponse, setStreamingResponse] = useState<StreamingState | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const wsClientRef = useRef<HermesWsClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  /** Gateway-внутренний ID сессии (для WS-операций: submitPrompt, interrupt).
   *  Отличается от sessionId (DB ID для REST). Заполняется из session.seeded
   *  или createSession. Сбрасывается при смене sessionId. */
  const [gatewaySid, setGatewaySid] = useState<string | null>(null);
  useEffect(() => {
    setGatewaySid(null);
  }, [sessionId]);
  // Мемоизированный подсчет размера payload и токенов
  const payloadStats = useMemo(() => sessionPayloadSize(messages), [messages]);
  const client = clientFor(agent);
  const queryClient = useQueryClient();

  // Синхронизируем вычисленный вес открытой сессии в кэш для сайдбара
  useEffect(() => {
    if (sessionId && sessionId !== 'new' && payloadStats.bytes > 0) {
      queryClient.setQueryData(['session-size', agent.id, sessionId], payloadStats);
    }
  }, [agent.id, sessionId, payloadStats, queryClient]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingResponse]);

  // Загрузка сообщений существующей сессии (только для сохраненных сессий)
  const isRealSavedSession = !!sessionId && sessionId !== 'new';
  const { data: historyData, isLoading: isHistoryLoading } = useQuery<SessionMessagesResponse>({
    queryKey: ['messages', agent.id, sessionId],
    queryFn: async () => {
      if (isRealSavedSession) {
        try {
          return await client.getSessionMessages(sessionId);
        } catch (err) {
          console.warn('Failed to load session messages from REST:', err);
          return { session_id: sessionId, messages: [] };
        }
      }
      return { session_id: sessionId || '', messages: [] };
    },
    enabled: isRealSavedSession,
  });

  // При получении истории
  useEffect(() => {
    if (historyData && 'messages' in historyData) {
      setMessages(historyData.messages);
    } else if (sessionId === 'new') {
      setMessages([]);
    }
    setStreamingResponse(null);
  }, [historyData, sessionId]);

  // Управление WebSocket соединением
  useEffect(() => {
    if (!sessionId) return;

    let isCancelled = false;
    let ws: HermesWsClient | null = null;

    const setupWs = async () => {
      // 1. Получаем токен
      await client.ensureAuth();
      const activeToken = (client as any).token;

      if (isCancelled) return;

      const wsBaseUrl = agent.proxyPath
        ? window.location.origin + agent.proxyPath
        : agent.baseUrl || window.location.origin;

      ws = new HermesWsClient({
        baseUrl: wsBaseUrl,
        token: activeToken ?? undefined,
        profile: agent.profile,
      });

      wsClientRef.current = ws;

      ws.onStatusChange = async (connected) => {
        setIsWsConnected(connected);
        if (connected && ws && !isCancelled) {
          if (sessionId === 'new') {
            console.log('WS ready for new session creation on first message');
          } else {
            try {
              console.log('Resuming session on gateway:', sessionId);
              const res = await ws.resumeSession(sessionId, { profile: agent.profile });
              if (res && typeof res === 'object' && 'session_id' in (res as any)) {
                setGatewaySid(String((res as any).session_id));
              }
            } catch (err) {
              console.warn('Session resume failed (possibly transient session):', err);
            }
          }
        }
      };

      ws.onEvent = (event) => {
        const { type, payload } = event;

        if (type === 'message.delta') {
          const text = (payload.text as string) ?? '';
          setStreamingResponse((prev) => {
            if (!prev) return { role: 'assistant', content: text };
            return { ...prev, content: prev.content + text };
          });
        } else if (type === 'thinking.delta' || type === 'reasoning.delta') {
          const text = (payload.text as string) ?? '';
          setStreamingResponse((prev) => {
            if (!prev) return { role: 'assistant', content: '', thinking: text };
            return { ...prev, thinking: (prev.thinking ?? '') + text };
          });
        } else if (type === 'tool.start') {
          const toolName = (payload.name as string) ?? 'tool';
          setStreamingResponse((prev) => {
            const tools = prev?.tools ? [...prev.tools] : [];
            tools.push({ name: toolName, status: 'running' });
            return { ...(prev ?? { role: 'assistant', content: '' }), tools };
          });
        } else if (type === 'tool.complete') {
          const toolName = (payload.name as string) ?? '';
          const output = (payload.output as string) ?? '';
          setStreamingResponse((prev) => {
            if (!prev || !prev.tools) return prev;
            const tools = prev.tools.map((t) =>
              t.name === toolName ? { ...t, status: 'done' as const, output } : t
            );
            return { ...prev, tools };
          });
        } else if (type === 'turn.end' || type === 'message.complete') {
          setStreamingResponse((prev) => {
            if (prev && (prev.content || prev.thinking || prev.tools?.length)) {
              setMessages((old) => [
                ...old,
                {
                  role: 'assistant',
                  content: prev.content,
                  thinking: prev.thinking,
                  tool_calls: prev.tools as any,
                  timestamp: Date.now(),
                },
              ]);
            }
            return null;
          });
          setIsStopping(false);
          // Обновляем список сессий для сайдбара
          queryClient.invalidateQueries({ queryKey: ['sessions', agent.id] });
        } else if (type === 'turn.error' || type === 'error') {
          console.error('Turn error event:', payload);
          setStreamingResponse((prev) => {
            if (prev) {
              setMessages((old) => [
                ...old,
                {
                  role: 'assistant',
                  content: prev.content || `⚠️ Ошибка: ${payload.message || JSON.stringify(payload)}`,
                  timestamp: Date.now(),
                },
              ]);
            }
            return null;
          });
          setIsStopping(false);
        } else if (type === 'session.seeded' || type === 'session.info') {
          const seededId = payload.session_id || payload.id || event.session_id;
          if (seededId) {
            console.log('Gateway active session ID (runtime):', seededId);
            setGatewaySid(String(seededId));
            // Only update parent App state if we were in 'new' (draft) mode
            if (sessionId === 'new') {
              const dbId = payload.stored_session_id || seededId;
              onSessionCreated?.(String(dbId));
            }
          }
        }
      };

      ws.connect().catch((err) => console.error('WS Connection error:', err));
    };

    setupWs();

    return () => {
      isCancelled = true;
      if (ws) {
        ws.close();
      }
      wsClientRef.current = null;
      setIsWsConnected(false);
    };
  }, [agent.id, sessionId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !sessionId) return;

    const userText = inputText;
    setInputText('');

    // Оптимистично добавляем сообщение пользователя в список
    const userMessage: HermesSessionMessage = {
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };

    setMessages((old) => [...old, userMessage]);
    setStreamingResponse({ role: 'assistant', content: '', thinking: 'Hermes думает...' });

    try {
      if (wsClientRef.current && isWsConnected) {
        let activeSid = gatewaySid || sessionId;
        let newSessionDbId: string | null = null;
        
        // Если сессия еще в статусе 'new', регистрируем ее прямо сейчас
        if (activeSid === 'new') {
          const res = await wsClientRef.current.createSession({ profile: agent.profile });
          if (res?.session_id) {
            activeSid = res.session_id;
            setGatewaySid(activeSid);
            newSessionDbId = res.stored_session_id || res.session_id;
          }
        }

        console.log(`Submitting prompt to session: ${activeSid}`);
        await wsClientRef.current.submitPrompt(activeSid, userText);

        if (newSessionDbId) {
          onSessionCreated?.(newSessionDbId);
        }
      } else {
        alert('WebSocket не подключен!');
        setStreamingResponse(null);
      }
    } catch (err: any) {
      console.error('Failed to submit prompt:', err);
      alert(`Ошибка отправки: ${err.message || String(err)}`);
      setStreamingResponse(null);
    }
  };

  const handleStop = async () => {
    if (!wsClientRef.current || !sessionId) return;
    setIsStopping(true);
    try {
      const activeSid = gatewaySid || sessionId;
      await wsClientRef.current.interrupt(activeSid);
    } catch (err) {
      console.warn('Interrupt call failed:', err);
    }
  };

  if (!sessionId) {
    return (
      <div className="pane" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <h2>Hermes Control Plane</h2>
          <p style={{ marginTop: 8, fontSize: '13px', color: 'var(--text-muted)' }}>
            Выберите или создайте сессию чата, чтобы начать работу с агентом.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pane" style={{ flex: 1 }}>
      <div className="pane-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="pane-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            💬 Chat Session ({sessionId === 'new' ? 'Draft' : sessionId.slice(0, 12)})
            <span
              className={`status-dot ${isWsConnected ? 'online' : 'offline'}`}
              title={isWsConnected ? 'WS active' : 'WS offline'}
              style={{ width: 6, height: 6 }}
            />
          </span>

          {messages.length > 0 && (
            <div className="session-header-stats">
              <span className="stat-item" title="Общий UTF-8 размер сообщений JSON payload">
                📦 {formatBytes(payloadStats.bytes)}
              </span>
              <span>•</span>
              <span className="stat-item">
                💬 {messages.length} сообщ.
              </span>
              <span>•</span>
              <span className="stat-item" title="Приблизительная оценка количества токенов (chars / 4)">
                ~{payloadStats.approxTokens.toLocaleString()} tok
              </span>
              {payloadStats.isHeavy && (
                <span className="heavy-badge" title="Сессия превышает 500 KB payload">
                  ⚠️ Тяжёлая сессия
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {streamingResponse && (
            <button
              className="btn btn-secondary"
              style={{
                padding: '3px 8px',
                fontSize: '11px',
                color: '#ef4444',
                borderColor: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={handleStop}
              disabled={isStopping}
              title="Прервать выполнение (/stop)"
            >
              ⛔ {isStopping ? 'Останавливаем...' : 'Остановить'}
            </button>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Target: {agent.name}
          </span>
        </div>
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {isHistoryLoading && <div style={{ color: 'var(--text-muted)' }}>Загрузка истории...</div>}

          {messages.map((msg, idx) => (
            <div key={idx} className={`message-bubble ${msg.role === 'user' ? 'user' : ''}`}>
              <div className="message-meta">
                <span>{msg.role === 'user' ? 'Вы' : 'Hermes Agent'}</span>
                {msg.timestamp && (
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>

              {/* Рендеринг мыслей */}
              {(msg as any).thinking && (
                <div className="thinking-block">
                  {String((msg as any).thinking)}
                </div>
              )}

              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

              {/* Вызовы инструментов */}
              {msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.map((t: any, tIdx) => (
                <div key={tIdx} className="tool-widget">
                  ⚙️ Tool: {t.name} ({t.status || 'done'})
                  {t.output && (
                    <div style={{ marginTop: 4, color: 'var(--text-secondary)', maxHeight: 100, overflowY: 'auto' }}>
                      {t.output}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Стриминг ответа */}
          {streamingResponse && (
            <div className="message-bubble">
              <div className="message-meta">
                <span>Hermes Agent (typing...)</span>
              </div>

              {streamingResponse.thinking && (
                <div className="thinking-block">
                  {streamingResponse.thinking}
                </div>
              )}

              <div style={{ whiteSpace: 'pre-wrap' }}>{streamingResponse.content}</div>

              {streamingResponse.tools && streamingResponse.tools.map((t, tIdx) => (
                <div key={tIdx} className="tool-widget">
                  ⚙️ Tool: {t.name} ({t.status})
                  {t.output && (
                    <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                      {t.output.slice(0, 150)}{t.output.length > 150 && '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <form onSubmit={handleSend} className="chat-input-wrapper">
            <input
              type="text"
              className="chat-textarea"
              placeholder={isWsConnected ? "Введите сообщение..." : "Ожидание вебсокет соединения..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={!isWsConnected}
            />
            {streamingResponse ? (
              <button
                className="btn btn-secondary"
                type="button"
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleStop}
                disabled={isStopping}
              >
                ⛔ {isStopping ? '...' : 'Стоп'}
              </button>
            ) : (
              <button className="btn" type="submit" disabled={!isWsConnected || !inputText.trim()}>
                Отправить
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
