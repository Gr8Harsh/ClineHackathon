import { useEffect, useState } from 'react';
import type { TraceEvent } from '../../shared/types.ts';
import { api } from '../api.ts';

export function TracePanel({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active || !open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (document.visibilityState !== 'hidden') {
          const events = await api.traces();
          if (!cancelled) { setTraces(events.slice(-100)); setError(''); setUpdated(new Date().toLocaleTimeString()); }
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) timer = setTimeout(poll, 3000); }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, open, retry]);
  return <details className="card" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Developer / judge panel · actual tool traces</summary>
    <div className="body">
      <p className="empty">Global demo events, not patient-isolated. Polls every 3 seconds while this panel and patient view are visible. {updated ? `Last refreshed ${updated}.` : 'No successful refresh yet.'}</p>
      {error && <div className="notice" role="alert">Trace refresh failed: {error}. Displayed events may be stale. <button className="btn btn-ghost" onClick={() => setRetry(r => r + 1)}>Retry</button></div>}
      {!traces.length && <p className="empty">No events received. No tool activity is implied.</p>}
      <div className="trace-list">{traces.map(t => <div key={t.id} className="trace">
        <span className="t">{new Date(t.at).toLocaleTimeString()}</span>
        <span className={`name ${t.origin === 'cline-sdk' ? 'cline' : 'app'}`}>{t.name}</span>
        <span>{t.origin === 'cline-sdk' ? 'Cline SDK' : 'Application'}</span>
        <span className={t.status === 'failed' ? 'badge-fail' : ''}>{t.status}</span>
        <span className="detail">{t.detail}</span>
      </div>)}</div>
    </div>
  </details>;
}