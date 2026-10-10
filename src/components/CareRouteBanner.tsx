import type { CareDecision, Booking } from '../../shared/types.ts';

const CLASS: Record<string, string> = {
  emergency: 'route-emergency', clarification: 'route-clarification',
  video: 'route-video', 'in-person': 'route-in-person',
};
const EYE: Record<string, string> = { emergency: '🚨', clarification: '💬', video: '🎥', 'in-person': '🏥' };

export function CareRouteBanner({ decision, booking }: { decision: CareDecision; booking: Booking | null }) {
  return (
    <section className={`route-banner ${CLASS[decision.route] ?? 'route-clarification'}`}>
      <h2>{EYE[decision.route]} {booking ? `Appointment booked — ${decision.title}` : decision.title}</h2>
      <p>{decision.explanation}</p>
      {decision.triggered.length > 0 && (
        <div className="rule-tags">
          {decision.triggered.map(t => <span key={t} className="rule-tag">{t}</span>)}
        </div>
      )}
      {decision.missing.length > 0 && (
        <div className="rule-tags">
          {decision.missing.map(m => <span key={m} className="rule-tag">⚠ not yet answered: {m}</span>)}
        </div>
      )}
      <div className="rule-tags">
        <span className="rule-tag" title="Deterministic rule set — illustrative only">rules {decision.ruleVersion}</span>
      </div>
    </section>
  );
}