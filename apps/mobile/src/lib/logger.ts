/**
 * Diagnostics logger (SEC-01 L6, ADR 0015 section 2).
 *
 * Content rules, enforced by the API shape rather than by trust:
 * - The event is a short static identifier ("db.open_failed"), never interpolated user text.
 * - Fields may only be numbers, booleans or null. Free strings (names, notes, file URIs, imported
 *   content, SQL parameters) cannot be passed, and keys that suggest such content are dropped.
 * - Errors are reduced to their class name and an optional short `code`. The message is never
 *   recorded, because messages can embed SQL parameters or Zod input echoes.
 * - Entries go to an in-memory ring buffer. `console` output happens only in development builds
 *   (`__DEV__`) and never under Jest, so release builds are a no-op for console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFieldValue = number | boolean | null | undefined;
export type LogFields = Record<string, LogFieldValue>;

export interface LogEntry {
  at: number;
  level: LogLevel;
  event: string;
  fields?: Record<string, number | boolean | null>;
  errorName?: string;
  errorCode?: string;
}

const EVENT_PATTERN = /^[a-z0-9_.:-]{1,64}$/i;
const CODE_PATTERN = /^[a-z0-9_.:-]{1,32}$/i;
const FORBIDDEN_KEY =
  /name|note|uri|url|path|file|content|sql|param|title|text|query|body|email|price|cost|cent|amount|markup|sell|money|bps/i;
const MAX_ENTRIES = 500; // ADR 0015 section 2

const buffer: LogEntry[] = [];

function devConsoleEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.JEST_WORKER_ID === undefined;
}

function cleanFields(fields: LogFields | undefined): LogEntry['fields'] {
  if (!fields) return undefined;
  const out: Record<string, number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    // Runtime guard for callers that bypass the types (for example through `as`).
    if (value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean' || value === null) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function errorParts(error: unknown): Pick<LogEntry, 'errorName' | 'errorCode'> {
  if (!(error instanceof Error)) return { errorName: 'NonError' };
  const rawCode = (error as { code?: unknown }).code;
  const name = EVENT_PATTERN.test(error.name) ? error.name : 'Error';
  return {
    errorName: name,
    ...(typeof rawCode === 'string' && CODE_PATTERN.test(rawCode) ? { errorCode: rawCode } : {}),
  };
}

function write(level: LogLevel, event: string, fields?: LogFields, error?: unknown): void {
  const entry: LogEntry = {
    at: Date.now(),
    level,
    event: EVENT_PATTERN.test(event) ? event : 'invalid_event',
  };
  const cleaned = cleanFields(fields);
  if (cleaned) entry.fields = cleaned;
  if (error !== undefined) Object.assign(entry, errorParts(error));
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);

  if (devConsoleEnabled()) {
    const sink = level === 'debug' ? console.debug : console[level];
    sink(`[${level}] ${entry.event}`, entry.fields ?? '', entry.errorName ?? '');
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write('debug', event, fields),
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  /** `error` contributes only its class name and `code`. */
  error: (event: string, error?: unknown, fields?: LogFields) =>
    write('error', event, fields, error ?? undefined),
  /** A copy of the ring buffer, oldest first (for Settings, About, Share diagnostics). */
  entries: (): LogEntry[] => buffer.map((e) => ({ ...e })),
  clear: (): void => {
    buffer.length = 0;
  },
};
