import { createEncounter, saveEncounter } from '../../server/domain/encounterStore.ts';
import { emptyScreening } from '../../server/rules/redFlags.ts';
import { createProposal, approveProposal, bookSlot } from '../../server/domain/booking.ts';

const slotId = process.env.RACE_SLOT_ID;
if (!slotId) throw new Error('RACE_SLOT_ID is required');

const enc = createEncounter('en', 'Race child');
const s = emptyScreening();
for (const k of Object.keys(s.answers)) s.answers[k] = 'no';
s.adult = 'yes';
s.physicalExam = 'no';
enc.screening = s;
saveEncounter(enc);

try {
  const proposal = createProposal(enc.id, slotId);
  const token = approveProposal(proposal.id, enc.id);
  bookSlot(proposal.id, token, enc.id);
  console.log('WIN');
} catch {
  console.log('LOSE');
}