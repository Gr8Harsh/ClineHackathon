import type { CareDecision, Booking } from '../../shared/types.ts';
import { formatAppointment } from '../ui.ts';

const CLASS: Record<string, string> = {
  emergency: 'route-emergency', clarification: 'route-clarification',
  video: 'route-video', 'in-person': 'route-in-person',
};
const EYE: Record<string, string> = { emergency: '🚨', clarification: '💬', video: '🎥', 'in-person': '🏥' };

export function CareRouteBanner({ decision, booking }: { decision: CareDecision; booking: Booking | null }) {
  return (
    <section role={decision.route === 'emergency' ? 'alert' : 'status'} className={`route-banner ${CLASS[decision.route] ?? 'route-clarification'}`}>
      <h2>{EYE[decision.route]} {decision.title}</h2>
      <p>{decision.explanation}</p>
      {decision.triggered.length > 0 && (
        <div className="rule-tags">
          {decision.triggered.map(t => <span key={t} className="rule-tag">{t}</span>)}
        </div>
      )}
      {decision.missing.length > 0 && (
        <div className="rule-tags">
          {decision.missing.map(m => <span key={m} className="rule-tag">⚠ missing or uncertain: {m}</span>)}
        </div>
      )}
      <div className="rule-tags">
        <span className="rule-tag" title="Deterministic rule set — illustrative only">rules {decision.ruleVersion}</span>
      </div>
      {booking && <div className="booking-receipt">
        <strong>{decision.route === 'emergency' ? 'Existing booking — do not wait for this appointment' : 'Booking receipt'}</strong>
        <p>{booking.doctorName} · {booking.mode} · ₹{booking.fee}</p>
        <p>{formatAppointment(booking.startsAt)}</p>
        <p>Booking ID: <code>{booking.id}</code></p>
      </div>}
    </section>
  );
}