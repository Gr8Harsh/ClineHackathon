import type { TraceEvent } from '../../shared/types.ts';

export function TracePanel({ traces }: { traces: TraceEvent[] }) {
  return (
    <section className="card">
      <header>Agent tool trace <span className="sub">live · application + Cline SDK</span></header>
      <div className="body" style={{ paddingTop: 8, paddingBottom: 8 }}>
        {traces.length === 0 ? (
          <p className="empty">Tool calls will appear here as the assistant works.</p>
        ) : (
          <div className="trace-list">
            {traces.map(t => (
              <div key={t.id} className="trace">
                <span className="t">{new Date(t.at).toLocaleTimeString()}</span>
                <span className={`name ${t.origin === 'cline-sdk' ? 'cline' : 'app'}`}>{t.name}</span>
                <span className={t.status === 'failed' ? 'badge-fail' : ''}>{t.status}</span>
                <span className="detail">{t.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}