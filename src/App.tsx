import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { PatientView } from './views/PatientView.tsx';
import { DoctorView } from './views/DoctorView.tsx';
import { EvalView } from './views/EvalView.tsx';

type Tab = 'patient' | 'doctor' | 'eval';

export function App() {
  const [tab, setTab] = useState<Tab>('patient');
  const [agentMode, setAgentMode] = useState<'cline-sdk' | 'guided' | null>(null);
  const [ruleVersion, setRuleVersion] = useState('');

  useEffect(() => {
    api.health().then(h => { setAgentMode(h.agentMode); setRuleVersion(h.ruleVersion); }).catch(() => setAgentMode('guided'));
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
          <div className="mode-pill" title={agentMode === 'cline-sdk' ? 'Live LLM via Cline SDK' : 'Deterministic guided mode — no API key set'}>
            <span className={`mode-dot ${agentMode === 'cline-sdk' ? 'live' : ''}`} />
            {agentMode === 'cline-sdk' ? 'Cline SDK · live agent' : 'Guided mode · no API key'}
          </div>
        )}
        <nav className="tabs">
          <button className={tab === 'patient' ? 'active' : ''} onClick={() => setTab('patient')}>Patient</button>
          <button className={tab === 'doctor' ? 'active' : ''} onClick={() => setTab('doctor')}>Doctor</button>
          <button className={tab === 'eval' ? 'active' : ''} onClick={() => setTab('eval')}>Evaluation</button>
        </nav>
      </header>

      <main className="layout">
        {tab === 'patient' && <PatientView />}
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