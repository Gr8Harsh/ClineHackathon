import { useEffect, useState } from 'react';
import type { EvalReport } from '../../shared/types.ts';
import { api } from '../api.ts';

export function EvalView() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try { setReport(await api.runEval()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => { api.evalReport().then(setReport).catch(() => {}); }, []);

  return (
    <>
      <section className="card">
        <header>Evaluation scoreboard <span className="sub">deterministic rule engine · measured, not claimed</span></header>
        <div className="body">
          {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
          {!report && <p className="empty">No report yet. Run the evaluation.</p>}
          {report && (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="score-big">{report.passed}/{report.total}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>scripted cases passed</div>
                  <div className="empty">rules {report.ruleVersion} · generated {new Date(report.generatedAt).toLocaleString()}</div>
                </div>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run evaluation'}</button>
              </div>
              <table className="eval-table">
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
              </table>
            </>
          )}
          <p className="empty" style={{ marginTop: 14 }}>
            These 20 cases exercise the deterministic routing and red-flag logic only. They do not validate
            language understanding, translation, or clinical accuracy, and they are not a measure of medical safety.
          </p>
        </div>
      </section>
    </>
  );
}