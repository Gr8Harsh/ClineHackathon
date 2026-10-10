import type { AvailableDoctor, Proposal } from '../../shared/types.ts';
import { formatAppointment, type LoadState } from '../ui.ts';

export function DoctorPicker({ doctors, state, error, onLoad, onPick, proposal, onConfirm, onCancel, busy }: {
  doctors: AvailableDoctor[]; state: LoadState; error: string;
  onLoad: () => void; onPick: (slotId: string) => void; proposal: Proposal | null;
  onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  const expired = proposal ? Date.parse(proposal.expiresAt) <= Date.now() : false;
  return <section className="card">
    <header>Find a doctor <span className="sub">fictional doctors · actual database availability</span></header>
    <div className="body stack">
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={onLoad}>
          {state === 'loading' ? 'Loading slots…' : state === 'idle' ? 'Show available doctors' : 'Refresh available slots'}
        </button>
        <span className="empty">A proposal does not reserve a slot.</span>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {state === 'success' && !doctors.some(d => d.slots.length) && <p className="empty">No eligible slots returned. Nothing has been booked. Try refreshing or contact a clinic directly.</p>}
      {state === 'success' && doctors.map(d => <div key={d.id} className="doctor-row">
        <div className="avatar" aria-hidden="true">{d.initials}</div>
        <div className="info">
          <div className="name">{d.name} <span className="prov prov-reported">{d.status}</span></div>
          <div className="spec">{d.specialty} · {d.location} · {d.languages} · ₹{d.fee}</div>
          <div className="slot-list">
            {d.slots.length === 0 && <span className="empty">No open slots</span>}
            {d.slots.map(s => <button key={s.id} className={`slot ${s.mode}`} disabled={busy || d.status !== 'available'} onClick={() => onPick(s.id)}>
              {formatAppointment(s.startsAt)} · {s.mode}
            </button>)}
          </div>
        </div>
      </div>)}
      {proposal && <div className="confirm-box" aria-label="Review appointment">
        <h3>Review before booking</h3>
        <dl>
          <dt>Doctor</dt><dd>{proposal.doctorName}</dd>
          <dt>When</dt><dd>{formatAppointment(proposal.startsAt)}</dd>
          <dt>Mode</dt><dd>{proposal.mode}</dd>
          <dt>Fee</dt><dd>₹{proposal.fee}</dd>
          <dt>Proposal expires</dt><dd>{formatAppointment(proposal.expiresAt)}</dd>
        </dl>
        <p>Nothing is booked yet. Availability is rechecked when you confirm. Another patient may book this slot first.</p>
        {expired && <p role="alert">Proposal expired. Refresh slots and choose again.</p>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy || expired} onClick={onConfirm}>{busy ? 'Working…' : 'Confirm and book'}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel proposal</button>
        </div>
      </div>}
    </div>
  </section>;
}