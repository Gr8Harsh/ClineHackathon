import { useEffect, useState } from 'react';
import type { EvalReport } from '../../shared/types.ts';
import { api } from '../api.ts';

export function EvalView() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try { setReport(await api.runEval()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let cancelled = false;
    api.evalReport().then(r => { if (!cancelled) setReport(r); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <section className="card">
        <header>Evaluation scoreboard <span className="sub">deterministic rule engine · measured, not claimed</span></header>
        <div className="body">
          <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Loading results…' : 'Run evaluation'}</button>
          {error && <div className="notice" role="alert" style={{ marginTop: 12 }}>{error} {report && 'Previous results remain below; they are not a fresh run.'}</div>}
          {!report && <p className="empty" role="status">{busy ? 'Fetching measured results…' : 'No report available. Run the evaluation to retry.'}</p>}
          {report && (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="score-big">{report.passed}/{report.total}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>scripted cases passed</div>
                  <div className="empty">rules {report.ruleVersion} · generated {new Date(report.generatedAt).toLocaleString()}</div>
                </div>
                <div style={{ flex: 1 }} />
              </div>
              <div className="table-scroll"><table className="eval-table">
                <thead><tr><th>Case</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
                <tbody>
                  {report.results.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{r.expected}</td>
                      <td>{r.actual}</td>
                      <td className={r.passed ? 'pass' : 'fail'}>{r.passed ? 'PASS' : 'FAIL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}
          <p className="empty" style={{ marginTop: 14 }}>
            These scripted cases exercise the deterministic routing and red-flag logic only. They do not validate
            language understanding, translation, or clinical accuracy, and they are not a measure of medical safety.
          </p>
        </div>
      </section>
    </>
  );
}