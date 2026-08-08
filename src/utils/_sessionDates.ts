import type { HermesSession } from '../types/hermes';

/**
 * Нормализует таймстемп в миллисекунды.
 * Hermes возвращает started_at / ended_at в секундах (float, < 1e12).
 */
export function normalizeTimestamp(ts?: number | null): number | null {
  if (ts === null || ts === undefined || !Number.isFinite(ts) || ts <= 0) {
    return null;
  }
  // Если таймстемп меньше 1e12, значит он в секундах, переводим в миллисекунды
  return ts < 1e12 ? Math.round(ts * 1000) : Math.round(ts);
}

/**
 * Чистая сортировка массива сессий от самых свежих к старым (Newest-First).
 * - Первичный ключ: started_at DESC (если нет, fallback на ended_at)
 * - Сессии без таймстемпа уходят в конец списка
 * - При равных таймстемпах: tie-break по id DESC
 */
export function sortSessionsNewestFirst(sessions: HermesSession[]): HermesSession[] {
  if (!sessions || !Array.isArray(sessions) || sessions.length <= 1) {
    return sessions ? [...sessions] : [];
  }

  return [...sessions].sort((a, b) => {
    const aTime = normalizeTimestamp(a.started_at) ?? normalizeTimestamp(a.ended_at) ?? 0;
    const bTime = normalizeTimestamp(b.started_at) ?? normalizeTimestamp(b.ended_at) ?? 0;

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return (b.id || '').localeCompare(a.id || '');
  });
}

export interface SessionWhenFormat {
  label: string;
  title: string;
}

/**
 * Форматирует дату активности сессии для карточки.
 * Возвращает label (для отображения) и title (для hover подсказки с полным ISO).
 */
export function formatSessionWhen(
  startedAt?: number | null,
  endedAt?: number | null
): SessionWhenFormat {
  const ms = normalizeTimestamp(startedAt) ?? normalizeTimestamp(endedAt);

  if (!ms) {
    return {
      label: '—',
      title: 'Время не указано',
    };
  }

  const date = new Date(ms);
  const title = `${date.toISOString()} (${date.toLocaleString()})`;

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return {
      label: `Сегодня, ${timeStr}`,
      title,
    };
  }

  if (isYesterday) {
    return {
      label: `Вчера, ${timeStr}`,
      title,
    };
  }

  const dateStr = date.toLocaleDateString([], {
    day: '2-digit',
    month: '2-digit',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });

  return {
    label: `${dateStr}, ${timeStr}`,
    title,
  };
}
