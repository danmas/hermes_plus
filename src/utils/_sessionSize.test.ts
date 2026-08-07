import { formatBytes, sessionPayloadSize, HEAVY_SESSION_BYTES } from './_sessionSize';
import type { HermesSessionMessage } from '../types/hermes';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running session-size test assertions...');

// Scenario: Small payload
const s800 = formatBytes(800);
assert(s800 === '800 B', `Expected '800 B', got '${s800}'`);

// Scenario: Kilobyte payload
const s19000 = formatBytes(19000);
assert(s19000 === '18.6 KB', `Expected '18.6 KB', got '${s19000}'`);

// Scenario: Megabyte payload
const s1500000 = formatBytes(1500000);
assert(s1500000 === '1.43 MB', `Expected '1.43 MB', got '${s1500000}'`);

// Scenario: Empty session
const empty = sessionPayloadSize([]);
assert(empty.chars === 0, 'Empty chars must be 0');
assert(empty.bytes === 0, 'Empty bytes must be 0');
assert(empty.approxTokens === 0, 'Empty approxTokens must be 0');
assert(empty.isHeavy === false, 'Empty isHeavy must be false');

// Scenario: Session with text content
const textMessages: HermesSessionMessage[] = [
  { role: 'user', content: 'Hello Hermes Agent! Please show status.' },
  { role: 'assistant', content: 'Everything is running smoothly.' },
];
const textStats = sessionPayloadSize(textMessages);
const expectedMinChars = textMessages[0].content!.length + textMessages[1].content!.length;
assert(textStats.chars >= expectedMinChars, 'Chars must be >= sum of contents');
assert(textStats.bytes >= textStats.chars, 'Bytes must be >= chars');
assert(textStats.approxTokens === Math.round(textStats.chars / 4), 'Tokens must be round(chars/4)');

// Scenario: Tool calls contribute to size
const messagesWithTools: HermesSessionMessage[] = [
  {
    role: 'assistant',
    content: 'Running command...',
    tool_calls: [{ name: 'run_command', args: { command: 'git status' }, output: 'clean' }],
  },
];
const messagesWithoutTools: HermesSessionMessage[] = [
  {
    role: 'assistant',
    content: 'Running command...',
  },
];
const withToolsStats = sessionPayloadSize(messagesWithTools);
const withoutToolsStats = sessionPayloadSize(messagesWithoutTools);
assert(
  withToolsStats.chars > withoutToolsStats.chars,
  'Tool calls must increase chars count'
);
assert(
  withToolsStats.bytes > withoutToolsStats.bytes,
  'Tool calls must increase bytes count'
);

// Scenario: Heavy session warning
const heavyPayload: HermesSessionMessage[] = [
  {
    role: 'assistant',
    content: 'x'.repeat(HEAVY_SESSION_BYTES + 1000),
  },
];
const heavyStats = sessionPayloadSize(heavyPayload);
assert(heavyStats.bytes > HEAVY_SESSION_BYTES, 'Heavy bytes must be > threshold');
assert(heavyStats.isHeavy === true, 'Heavy payload must have isHeavy: true');

// Scenario: Deterministic compute
const calc1 = sessionPayloadSize(textMessages);
const calc2 = sessionPayloadSize(textMessages);
assert(JSON.stringify(calc1) === JSON.stringify(calc2), 'Computations must be deterministic');

console.log('✅ All session-size test assertions passed successfully!');
