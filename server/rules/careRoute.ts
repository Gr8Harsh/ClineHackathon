import { CareDecision, Screening } from '../../shared/types.ts';
import { evaluateRedFlags } from './redFlags.ts';

/**
 * Deterministic care routing. Emergency detection always wins.
 * Routine routing uses purpose + physical-exam need + availability (from the caller).
 */
export function decideCareRoute(
  screening: Screening,
  freeText: string[],
  availability: { video: boolean; inPerson: boolean },
): CareDecision {
  const { triggered, missingSafety, ruleVersion } = evaluateRedFlags(screening, freeText);

  if (triggered.length > 0) {
    return {
      route: 'emergency',
      title: 'Emergency care now',
      explanation:
        'One or more emergency warning signs were detected from your answers. This system cannot tell you what the condition is, but this pattern needs in-person emergency assessment now. Call your local emergency number or go to the nearest emergency department. Do not wait for a booked appointment.',
      triggered: triggered.map(t => `${t.id} — ${t.label}`),
      missing: missingSafety,
      ruleVersion,
    };
  }

  const missing = [...missingSafety];
  if (missing.length) {
    return { route: 'clarification', title: 'More information needed',
      explanation: 'Safety screening is incomplete or uncertain. Unknown is not no. Ask a clinician if unsure; do not delay urgent care.',
      triggered: [], missing, ruleVersion };
  }

  // Legacy clinician mode flags remain readable. With no clinician mode decision,
  // conservatively coordinate an in-person assessment; never ask patients to decide.
  if (screening.physicalExam !== 'no') {
    if (!availability.inPerson) return { route: 'clarification', title: 'No suitable appointment available',
      explanation: 'No in-person appointment is available. Availability cannot downgrade the requested care mode. Contact a clinic directly.',
      triggered: [], missing: [], ruleVersion };
    return {
      route: 'in-person',
      title: 'In-person consultation',
      explanation: 'The application offers an in-person clinician assessment when examination suitability is unresolved. This is a conservative coordination policy, not validated triage or an assurance that there is no emergency.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  if (screening.physicalExam === 'no') {
    if (availability.video) {
      return {
        route: 'video', title: 'Video consultation possible',
        explanation: 'A video consultation is available, so this first consultation may not need a long journey. You answered the listed screening questions and indicated no examination is needed; the doctor may still ask you to come in. A clinician must assess suitability. This is not a diagnosis, validated triage, or assurance that there is no emergency.',
        triggered: [], missing: missingSafety, ruleVersion,
      };
    }
    return {
      route: 'clarification', title: 'No suitable slot available',
      explanation: 'No video slot is available. Nothing is booked. Contact a clinic directly; availability does not establish medical suitability for another mode.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  return {
    route: 'clarification', title: 'More information needed',
    explanation: 'An examination preference is unresolved. A clinician must assess suitability.',
    triggered: [], missing: missingSafety, ruleVersion,
  };
}