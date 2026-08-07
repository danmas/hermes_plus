import type { HermesSessionMessage } from '../types/hermes';

/** Порог размера тяжелой сессии в байтах (500 KB) */
export const HEAVY_SESSION_BYTES = 500_000;

export interface SessionPayloadStats {
  chars: number;
  bytes: number;
  approxTokens: number;
  isHeavy: boolean;
}

/**
 * Форматирует количество байт в короткую человекочитаемую строку (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) {
    return '0 B';
  }

  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  if (bytes < KB) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < MB) {
    const val = bytes / KB;
    const formatted = val >= 10 ? val.toFixed(1) : val.toFixed(1);
    return `${parseFloat(formatted)} KB`;
  }
  if (bytes < GB) {
    const val = bytes / MB;
    const formatted = val.toFixed(2);
    return `${parseFloat(formatted)} MB`;
  }

  const val = bytes / GB;
  return `${parseFloat(val.toFixed(2))} GB`;
}

/**
 * Чистая функция для вычисления размера payload сессии из массива сообщений.
 */
export function sessionPayloadSize(
  messages?: HermesSessionMessage[] | null
): SessionPayloadStats {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      chars: 0,
      bytes: 0,
      approxTokens: 0,
      isHeavy: false,
    };
  }

  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
    }
    if (typeof (msg as any).thinking === 'string') {
      chars += ((msg as any).thinking as string).length;
    }
    if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      chars += JSON.stringify(msg.tool_calls).length;
    }
  }

  let bytes = 0;
  try {
    const jsonStr = JSON.stringify(messages);
    if (typeof TextEncoder !== 'undefined') {
      bytes = new TextEncoder().encode(jsonStr).length;
    } else if (typeof (globalThis as any).Buffer !== 'undefined') {
      bytes = (globalThis as any).Buffer.byteLength(jsonStr, 'utf-8');
    } else {
      bytes = jsonStr.length;
    }
  } catch {
    bytes = chars;
  }

  const approxTokens = Math.round(chars / 4);
  const isHeavy = bytes > HEAVY_SESSION_BYTES;

  return {
    chars,
    bytes,
    approxTokens,
    isHeavy,
  };
}
