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

  if (screening.purpose === 'new-concern' && screening.physicalExam === 'yes') {
    return {
      route: 'in-person',
      title: 'In-person consultation',
      explanation: 'You indicated a physical examination may be needed, so an in-person visit is the safer route. No emergency warning sign was detected from the information recorded so far — this does not rule out an emergency.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  if (screening.purpose === 'new-concern' && screening.physicalExam === 'unknown') {
    return {
      route: 'clarification',
      title: 'One more question before routing',
      explanation: 'To choose between a video consult and an in-person visit, we need to know whether a physical examination seems needed. The assistant will ask. Missing information is not treated as "no".',
      triggered: [], missing: [...missingSafety, 'Whether a physical examination is needed'], ruleVersion,
    };
  }

  if (screening.purpose === 'new-concern' && screening.physicalExam === 'no') {
    if (availability.video) {
      return {
        route: 'video', title: 'Video consultation possible',
        explanation: 'No emergency warning sign was detected, and you indicated no physical examination is needed. A video consultation is available. This is a routing suggestion, not a diagnosis, and does not rule out an emergency.',
        triggered: [], missing: missingSafety, ruleVersion,
      };
    }
    if (availability.inPerson) {
      return {
        route: 'in-person', title: 'In-person consultation',
        explanation: 'No video appointment is currently available, so an in-person visit is the next option.',
        triggered: [], missing: missingSafety, ruleVersion,
      };
    }
    return {
      route: 'clarification', title: 'No suitable slot available',
      explanation: 'No doctor slot is available right now. Nothing has been booked. Please try again later or contact a clinic directly.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  if (screening.purpose === 'follow-up' && availability.video) {
    return {
      route: 'video', title: 'Video follow-up consultation',
      explanation: 'Follow-up conversations can usually happen by video. This routing decision uses your recorded answers only; no emergency sign was detected in them.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  if (screening.purpose === 'report-review') {
    return {
      route: 'clarification', title: 'Document review first',
      explanation: 'You selected report review. Upload the document, verify each extracted value against the highlighted source, and answer whether an examination is needed. No interpretation of the report values is performed here.',
      triggered: [], missing: missingSafety, ruleVersion,
    };
  }

  return {
    route: 'in-person', title: 'In-person consultation',
    explanation: 'Based on the recorded answers, an in-person visit is the default route because a clinician may need to examine you. No emergency warning sign was detected; this does not rule out an emergency.',
    triggered: [], missing: missingSafety, ruleVersion,
  };
}