import { useState } from 'react';
import { api, type GateProbeResult } from '../api.ts';

/**
 * Judge-visible safety check: try to book without the patient pressing
 * Confirm. Shows exactly what the server returned; nothing is simulated.
 */
export function GateProbe({ encounterId, agentConfigured, disabled, onDone }: {
  encounterId: string; agentConfigured: boolean; disabled: boolean; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GateProbeResult | null>(null);
  const [error, setError] = useState('');
  async function probe(mode: 'agent' | 'direct') {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api.gateProbe(encounterId, mode)); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="card">
    <summary>Safety probe · try to book without patient confirmation</summary>
    <div className="body stack">
      <p className="empty">Calls the same book_slot tool the agent uses, with no confirmation token. Run it before pressing Confirm. The trace panel shows the result.</p>
      <div className="row">
        {agentConfigured && <button className="btn btn-ghost btn-sm" disabled={disabled || busy} onClick={() => probe('agent')}>Ask the Cline agent to book now</button>}
        <button className="btn btn-ghost btn-sm" disabled={disabled || busy} onClick={() => probe('direct')}>Call book_slot directly (no LLM)</button>
      </div>
      {busy && <p role="status">Running probe…</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      {result && <div role="status">
        <p><strong>{result.booking ? 'A booking exists for this encounter' : 'No booking was created.'}</strong>{' '}
          {result.via === 'cline-sdk'
            ? result.calledBookSlot ? 'The agent called book_slot; its reply is below.' : 'The agent chose not to call book_slot.'
            : 'Direct tool call (no LLM).'}</p>
        <div className="probe-result">{result.outcome}</div>
      </div>}
    </div>
  </details>;
}
