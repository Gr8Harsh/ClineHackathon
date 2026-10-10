import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { PatientView } from './views/PatientView.tsx';
import { DoctorView } from './views/DoctorView.tsx';
import { EvalView } from './views/EvalView.tsx';
import { PreviewApp } from './preview/PreviewApp.tsx';
import { MainAssistant } from './preview/MainAssistant.tsx';
import './preview/preview.css';

type Tab = 'patient' | 'doctor' | 'eval';

export function App() {
  const params = new URLSearchParams(window.location.search);
  return params.get('live') === '1' ? <LiveApp /> : params.get('fixture') === '1' ? <PreviewApp /> : <MainAssistant />;
}

function LiveApp() {
  const [tab, setTab] = useState<Tab>('patient');
  const [agentMode, setAgentMode] = useState<'cline-sdk' | 'guided' | null>(null);
  const [ruleVersion, setRuleVersion] = useState('');
  const [healthError, setHealthError] = useState('');
  const [healthLoading, setHealthLoading] = useState(false);

  async function checkHealth() {
    setHealthLoading(true); setHealthError('');
    try {
      const h = await api.health();
      if (!h.ok) throw new Error('API health check failed');
      setAgentMode(h.agentMode); setRuleVersion(h.ruleVersion);
    } catch (e) { setAgentMode(null); setHealthError((e as Error).message); }
    finally { setHealthLoading(false); }
  }

  useEffect(() => {
    void checkHealth();
  }, []);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="logo">SEHAT OS</div>
          <div className="tagline">Care, with clarity — every line shows where it came from.</div>
        </div>
        <div className="spacer" />
        {agentMode && (
          <div className="mode-pill" title="Configuration status is not proof of a successful live model call.">
            <span className={`mode-dot ${agentMode === 'cline-sdk' ? 'live' : ''}`} />
            {agentMode === 'cline-sdk' ? 'Cline SDK · configured' : 'Guided mode · no general translation'}
          </div>
        )}
        <nav className="tabs" aria-label="Demo views">
          <button aria-current={tab === 'patient' ? 'page' : undefined} className={tab === 'patient' ? 'active' : ''} onClick={() => setTab('patient')}>Patient</button>
          <button aria-current={tab === 'doctor' ? 'page' : undefined} className={tab === 'doctor' ? 'active' : ''} onClick={() => setTab('doctor')}>Doctor</button>
          <button aria-current={tab === 'eval' ? 'page' : undefined} className={tab === 'eval' ? 'active' : ''} onClick={() => setTab('eval')}>Evaluation</button>
        </nav>
      </header>

      <main className="layout">
        <div className="demo-notice"><strong>Local demo · synthetic data only.</strong> No authentication or patient isolation. Do not enter real medical information.</div>
        {healthError && <div className="notice" role="alert">API status unavailable: {healthError} <button className="btn btn-ghost btn-sm" disabled={healthLoading} onClick={checkHealth}>Retry connection</button></div>}
        {healthLoading && <p role="status">Checking API connection…</p>}
        <div hidden={tab !== 'patient'}><PatientView active={tab === 'patient'} agentConfigured={agentMode === 'cline-sdk'} /></div>
        {tab === 'doctor' && <DoctorView />}
        {tab === 'eval' && <EvalView />}
      </main>

      <footer className="safety-footer">
        <strong>SEHAT OS is a synthetic-data demonstration, not a medical device.</strong><br />
        It does not diagnose, does not recommend medicine, and cannot rule out an emergency.
        Emergency screening uses an illustrative, rule-based set (version {ruleVersion || '…'}) derived from public
        NHS guidance and requires clinician review before any real-world use. If you think you are having an
        emergency, call your local emergency number now.
      </footer>
    </>
  );
}