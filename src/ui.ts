import type { Snapshot } from '../shared/types.ts';

export type LoadState = 'idle' | 'loading' | 'success' | 'error';

// Presentation gate only: the backend owns clinical routing and enforcement.
export function canOfferBooking(snapshot: Snapshot): boolean {
  return !snapshot.booking && snapshot.decision.missing.length === 0 &&
    (snapshot.decision.route === 'video' || snapshot.decision.route === 'in-person');
}

export function formatAppointment(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' IST (UTC+05:30)';
}

export function focusEvidence(id: string) {
  const element = document.getElementById(id);
  let ancestor = element?.parentElement;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  element?.focus({ preventScroll: true });
}