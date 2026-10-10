import { TraceEvent } from '../shared/types.ts';
import { getDb } from './db.ts';
import { uuid, nowIso } from './lib/ids.ts';

const memory: TraceEvent[] = [];

export function trace(name: string, status: TraceEvent['status'], detail: string, origin: TraceEvent['origin'] = 'application'): TraceEvent {
  const event: TraceEvent = { id: uuid(), at: nowIso(), name, status, detail: detail.slice(0, 400), origin };
  memory.push(event);
  if (memory.length > 300) memory.splice(0, memory.length - 300);
  try {
    getDb().prepare('INSERT INTO traces (at,name,status,detail,origin) VALUES (?,?,?,?,?)').run(event.at, event.name, event.status, event.detail, event.origin);
  } catch { /* tracing must not break the product */ }
  return event;
}

export function recentTraces(limit = 100): TraceEvent[] {
  return [...memory].reverse().slice(0, limit);
}