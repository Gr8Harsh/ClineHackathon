import type { AvailableDoctor, CareDecision, Proposal, Booking } from '../../shared/types.ts';

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

export function DoctorPicker({
  decision, doctors, loading, onLoad, onPick, proposal, pendingToken, onConfirm, onFinalize, busy,
}: {
  decision: CareDecision; doctors: AvailableDoctor[]; loading: boolean;
  onLoad: () => void; onPick: (slotId: string) => void;
  proposal: Proposal | null; pendingToken: string | null;
  onConfirm: () => void; onFinalize: () => void; busy: boolean;
}) {
  const route = decision.route;
  const blocked = route === 'emergency' || route === 'clarification';

  return (
    <section className="card">
      <header>
        Find a doctor <span className="sub">real database slots · never invented</span>
      </header>
      <div className="body">
        {blocked && (
          <div className="notice">
            {route === 'emergency'
              ? 'Booking is paused because an emergency warning sign was detected. Please seek emergency care now instead of waiting for an appointment.'
              : 'Booking opens once the remaining routing question is answered. Nothing has been booked.'}
          </div>
        )}
        {!blocked && !doctors.length && !loading && (
          <div className="row">
            <p className="empty" style={{ margin: 0 }}>Load real, available slots for your route.</p>
            <button className="btn btn-primary btn-sm" onClick={onLoad}>Show available doctors</button>
          </div>
        )}
        {loading && doctors.length === 0 && !blocked && <p className="empty">Loading…</p>}

        {doctors.map(d => (
          <div key={d.id} className="doctor-row">
            <div className="avatar">{d.initials}</div>
            <div className="info">
              <div className="name">{d.name} {d.status === 'offline' && <span className="prov prov-missing">offline</span>}</div>
              <div className="spec">{d.specialty} · {d.location} · {d.languages} · ₹{d.fee}</div>
              <div className="slot-list">
                {d.slots.length === 0 ? <span className="empty">no open slots</span> :
                  d.slots.map(s => (
                    <button key={s.id} className={`slot ${s.mode === 'video' ? 'video' : ''}`} onClick={() => onPick(s.id)}>
                      {fmt(s.startsAt)} · {s.mode}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ))}

        {proposal && !pendingToken && (
          <div className="confirm-box" style={{ marginTop: 14 }}>
            <h3>Review before booking</h3>
            <dl>
              <dt>Doctor</dt><dd>{proposal.doctorName}</dd>
              <dt>When</dt><dd>{fmt(proposal.startsAt)}</dd>
              <dt>Mode</dt><dd>{proposal.mode}</dd>
              <dt>Fee</dt><dd>₹{proposal.fee}</dd>
            </dl>
            <div className="row">
              <button className="btn btn-primary" disabled={busy} onClick={onConfirm}>Yes, confirm this appointment</button>
              <span className="empty">The slot is held, not booked, until you confirm.</span>
            </div>
          </div>
        )}

        {proposal && pendingToken && (
          <div className="confirm-box" style={{ marginTop: 14 }}>
            <h3>Confirm booking · {proposal.doctorName}</h3>
            <p style={{ margin: '0 0 10px', fontSize: 13 }}>
              You pressed Confirm. The booking is created now — exactly one patient can hold this slot.
            </p>
            <button className="btn btn-primary" disabled={busy} onClick={onFinalize}>
              {busy ? 'Booking…' : 'Book this appointment'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}