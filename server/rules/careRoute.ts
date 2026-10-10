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
  if (screening.adult !== 'yes') missing.push('Adult eligibility: this illustrative workflow is adults-only');
  if (screening.physicalExam === 'unknown') missing.push('Whether an examination may be needed');
  if (missing.length) {
    return { route: 'clarification', title: 'More information needed',
      explanation: 'Screening is incomplete, uncertain, or outside this adult demo’s scope. Unknown is not no. Ask a clinician if unsure; do not delay urgent care.',
      triggered: [], missing, ruleVersion };
  }

  if (screening.physicalExam === 'yes') {
    if (!availability.inPerson) return { route: 'clarification', title: 'No suitable appointment available',
      explanation: 'No in-person appointment is available. Availability cannot downgrade the requested care mode. Contact a clinic directly.',
      triggered: [], missing: [], ruleVersion };
    return {
      route: 'in-person',
      title: 'In-person consultation',
      explanation: 'You indicated an examination may be needed. An in-person appointment is available. This is an illustrative coordination choice, not validated triage. No listed warning sign was identified; this does not rule out an emergency.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  if (screening.physicalExam === 'no') {
    if (availability.video) {
      return {
        route: 'video', title: 'Video consultation possible',
        explanation: 'You answered the listed screening questions and indicated no examination is needed. Video is available, but a clinician must assess suitability. This is not a diagnosis, validated triage, or assurance that there is no emergency.',
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