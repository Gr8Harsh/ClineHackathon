import { useEffect, useRef, useState } from 'react';
import type { Language, Message, Snapshot } from '../../shared/types.ts';
import { api, ApiError } from '../api.ts';

// Only the synthetic encounter ID is stored; medical content never is.
const STORAGE_KEY = 'sehat-olive-encounter-id';
function savedId() { try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; } }
function saveId(id: string | null) {
  try { if (id) sessionStorage.setItem(STORAGE_KEY, id); else sessionStorage.removeItem(STORAGE_KEY); }
  catch { /* In-memory state still works when storage is unavailable. */ }
}

export interface PendingMessage { id: string; text: string; language: Language; status: 'queued' | 'sending' | 'failed'; error?: string }
/** One ordered, retryable outbox. Patient text renders before any network operation. */
export function useConversation(language: Language) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const outbox = useRef<PendingMessage[]>([]);
  const current = useRef<Snapshot | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Restore the active encounter after a reload.
  useEffect(() => {
    const id = savedId();
    if (!id) return;
    api.getEncounter(id).then(s => { if (!current.current) updateSnapshot(s); })
      .catch(e => { if (e instanceof ApiError && e.status === 404) saveId(null); });
  }, []);
  function publish() { if (mounted.current) setPending(outbox.current.map(m => ({ ...m }))); }
  function updateSnapshot(value: Snapshot) { current.current = value; saveId(value.encounter.id); if (mounted.current) setSnapshot(value); }
  async function refresh() {
    if (!current.current || running.current) return;
    try { updateSnapshot(await api.getEncounter(current.current.encounter.id)); } catch { /* Keep the last known state. */ }
  }
  function reset() {
    if (running.current) return;
    outbox.current = []; current.current = null; saveId(null);
    publish(); if (mounted.current) setSnapshot(null);
  }
  async function drain() {
    if (running.current) return;
    running.current = true;
    if (mounted.current) setBusy(true);
    try {
      while (outbox.current.length) {
        const item = outbox.current[0];
        if (item.status === 'failed') break;
        item.status = 'sending'; publish();
        try {
          if (!current.current) updateSnapshot(await api.createEncounter(item.language));
          const result = await api.conversationMessage(current.current!.encounter.id, item.text, item.id);
          updateSnapshot(result.snapshot);
          outbox.current.shift(); publish();
        } catch (error) {
          item.status = 'failed'; item.error = (error as Error).message; publish(); break;
        }
      }
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  function send(text: string) {
    if (!text.trim() || text.length > 4000) return;
    outbox.current.push({ id: crypto.randomUUID(), text: text.trim(), language, status: 'queued' });
    publish(); void drain();
  }
  function retry(id: string) {
    const item = outbox.current.find(m => m.id === id);
    if (item?.status === 'failed') { item.status = 'queued'; item.error = undefined; publish(); void drain(); }
  }
  const pendingIds = new Set(pending.map(m => m.id));
  const messages: Message[] = snapshot?.encounter.messages.filter(m => !m.clientMessageId || !pendingIds.has(m.clientMessageId)) ?? [];
  return { snapshot, messages, pending, busy, send, retry, updateSnapshot, refresh, reset };
}
