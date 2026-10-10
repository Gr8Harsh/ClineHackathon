import { Answer, Screening } from '../../shared/types.ts';

export const RULE_VERSION = 'sehat-redflags-v0.3.0-selfcare-draft';

export interface RedFlagRule {
  id: string;
  label: string;
  citation: string;
  citationUrl: string;
  screeningKey?: string;
  patterns?: RegExp[];
}

/**
 * Illustrative rule set derived from public NHS guidance for demonstration only.
 * NOT a diagnostic tool. Requires clinician review before any real-world use.
 * Sources: NHS heart attack, stroke (FAST), sepsis, vomiting blood,
 * self-harm, head injury and poisoning guidance.
 */
export const RED_FLAG_RULES: RedFlagRule[] = [
  { id: 'RF-01', label: 'Chest pain described as squeezing or pressure', citation: 'NHS — Heart attack: call 999 for chest pain that feels tight or squeezing', citationUrl: 'https://www.nhs.uk/conditions/heart-attack/', screeningKey: 'chestPressure', patterns: [/chest (pain|pressure|tightness)/i, /squeez(ing|e).{0,20}chest/i, /chest.{0,20}(squeez|pressure|tight)/i] },
  { id: 'RF-02', label: 'Chest pain spreading to arm, neck or jaw', citation: 'NHS — Heart attack: chest pain spreading to arm, neck or jaw', citationUrl: 'https://www.nhs.uk/conditions/heart-attack/', screeningKey: 'radiatingChestPain', patterns: [/chest.{0,40}(arm|neck|jaw)/i, /(arm|neck|jaw).{0,40}chest pain/i] },
  { id: 'RF-03', label: 'Severe difficulty breathing or unable to speak in sentences', citation: 'NHS — Heart attack: severe difficulty breathing, gasping or unable to get words out', citationUrl: 'https://www.nhs.uk/conditions/heart-attack/', screeningKey: 'breathlessSevere', patterns: [/can'?t breathe/i, /cannot breathe/i, /severe short(ness)? of breath/i, /gasping/i, /struggling to breathe/i] },
  { id: 'RF-04', label: 'Sudden weakness or numbness on one side of the body', citation: 'NHS — Stroke symptoms: weakness or numbness down one side', citationUrl: 'https://www.nhs.uk/conditions/stroke/symptoms/', screeningKey: 'oneSidedWeakness', patterns: [/one side/i, /left side.{0,30}(weak|numb)/i, /right side.{0,30}(weak|numb)/i] },
  { id: 'RF-05', label: 'Face drooping on one side', citation: 'NHS — Stroke symptoms: face weakness, one side of face may droop', citationUrl: 'https://www.nhs.uk/conditions/stroke/symptoms/', screeningKey: 'faceDroop', patterns: [/face.{0,20}(droop|slant|weak)/i, /face.{0,20}(one side|one half)/i] },
  { id: 'RF-06', label: 'Slurred or confused speech', citation: 'NHS — Stroke symptoms: speech problems, slurred words or confusion', citationUrl: 'https://www.nhs.uk/conditions/stroke/symptoms/', screeningKey: 'speechSlurred', patterns: [/slurr(ed|ing)/i, /can'?t (speak|talk)/i, /unable to (speak|talk)/i] },
  { id: 'RF-07', label: 'Stroke signs within the last 24 hours, even if they stopped', citation: 'NHS — Stroke: call 999 if signs occurred within the last 24 hours even if they stopped', citationUrl: 'https://www.nhs.uk/conditions/stroke/symptoms/', screeningKey: 'strokeLast24h' },
  { id: 'RF-08', label: 'Fainting or loss of consciousness', citation: 'NHS — Heart attack: call 999 if someone has passed out and is not responding normally', citationUrl: 'https://www.nhs.uk/conditions/heart-attack/', screeningKey: 'fainted', patterns: [/passed out/i, /blacked out/i, /lost consciousness/i, /fainted/i] },
  { id: 'RF-09', label: 'Blue, grey or very pale skin, lips or tongue', citation: 'NHS — Sepsis and heart attack: blue, grey or pale skin', citationUrl: 'https://www.nhs.uk/conditions/sepsis/', screeningKey: 'bluePale', patterns: [/lips? .{0,15}(blue|grey|gray)/i, /skin .{0,15}(blue|grey|gray)/i] },
  { id: 'RF-10', label: 'Uncontrollable shivering with very high or very low temperature', citation: 'NHS — Sepsis: very high or very low temperature, shivering', citationUrl: 'https://www.nhs.uk/conditions/sepsis/', screeningKey: 'shiveringFever' },
  { id: 'RF-11', label: 'Confusion or slurred speech with signs of infection', citation: 'NHS — Sepsis: confusion or slurred speech', citationUrl: 'https://www.nhs.uk/conditions/sepsis/', screeningKey: 'confusion' },
  { id: 'RF-12', label: 'Not passing urine all day or very little in 18 hours', citation: 'NHS — Sepsis: not peeing all day or very little in past 18 hours', citationUrl: 'https://www.nhs.uk/conditions/sepsis/', screeningKey: 'noUrine' },
  { id: 'RF-13', label: 'Rash that does not fade when pressed', citation: 'NHS — Sepsis: rash that does not fade when pressed', citationUrl: 'https://www.nhs.uk/conditions/sepsis/', screeningKey: 'nonFadingRash', patterns: [/rash.{0,30}(not fade|does ?n.?t fade|doesn.t go)/i] },
  { id: 'RF-14', label: 'Fits, seizures or sudden collapse', citation: 'NHS — Sepsis: a fit (seizure) in babies and children', citationUrl: 'https://www.nhs.uk/conditions/sepsis/', screeningKey: 'seizure', patterns: [/seizure/i, /fitting/i, /convulsion/i] },
  { id: 'RF-15', label: 'Coughing or vomiting blood', citation: 'NHS — Vomiting blood: seek urgent medical help', citationUrl: 'https://www.nhs.uk/conditions/vomiting-blood/', screeningKey: 'vomitingBlood', patterns: [/vomit(ing)? blood/i, /cough(ing)? up blood/i, /blood in (my|the) (vomit|stool|urine)/i] },
  { id: 'RF-16', label: 'Thoughts of self-harm or suicide', citation: 'NHS — Help after self-harm: seek help immediately if in immediate danger', citationUrl: 'https://www.nhs.uk/conditions/self-harm/', screeningKey: 'selfHarm', patterns: [/suicid(e|al)/i, /kill(ing)? myself/i, /self.?harm/i, /end my life/i] },
  { id: 'RF-17', label: 'Severe head injury or being knocked unconscious', citation: 'NHS — Head injury: call 999 for severe head injury', citationUrl: 'https://www.nhs.uk/conditions/head-injury/', screeningKey: 'headInjury', patterns: [/head injury/i, /knocked unconscious/i] },
  { id: 'RF-18', label: 'Poisoning or overdose', citation: 'NHS — Poisoning: call 999 for suspected overdose', citationUrl: 'https://www.nhs.uk/conditions/poisoning/', screeningKey: 'overdose', patterns: [/overdose/i, /took (too many|an overdose)/i, /poison(ing)?/i] },
];

const ALL_KEYS = RED_FLAG_RULES.map(r => r.screeningKey).filter(Boolean) as string[];

export function emptyScreening(): Screening {
  const answers: Record<string, Answer> = {};
  for (const key of ALL_KEYS) answers[key] = 'unknown';
  return { answers, adult: 'unknown', purpose: 'new-concern', physicalExam: 'unknown', completed: false };
}

export interface RedFlagResult {
  triggered: { id: string; label: string; citation: string; citationUrl: string }[];
  missingSafety: string[];
  ruleVersion: string;
}

/**
 * Deterministic evaluation: only explicit "yes" triggers; missing stays missing.
 * Free-text matching is negation-aware so "I do not have chest pain" does not
 * count as chest pain. This is a narrow safety measure, not general NLU.
 */
function hasPositiveMention(text: string, pattern: RegExp): boolean {
  return text.split(/[,.!?;]|\bbut\b|\band\b/i).some(clause => {
    for (const m of clause.matchAll(new RegExp(pattern.source, 'gi'))) {
      const before = clause.slice(0, m.index).trim();
      if (!/(?:\bno|\bwithout|\bdenies|\b(?:do not|don't|does not|doesn't) have)\s*$/i.test(before)) return true;
    }
    return false;
  });
}

export function evaluateRedFlags(screening: Screening, freeText: string[] = []): RedFlagResult {
  const triggered: RedFlagResult['triggered'] = [];
  for (const rule of RED_FLAG_RULES) {
    const byScreening = rule.screeningKey && screening.answers[rule.screeningKey] === 'yes';
    const byText = (rule.patterns ?? []).some(p => freeText.some(t => hasPositiveMention(t, p)));
    if (byScreening || byText) triggered.push({ id: rule.id, label: rule.label, citation: rule.citation, citationUrl: rule.citationUrl });
  }
  // Supplemental draft self-care signs do not alter the existing 18-question catalogue.
  // They are application-owned safeguards, not a claim of clinician validation.
  for (const rule of SELFCARE_TEXT_RULES) {
    if (rule.patterns.some(p => freeText.some(t => hasPositiveMention(t, p)))) {
      triggered.push({ id: rule.id, label: rule.label, citation: 'Supplied self-care draft, section 3 — needs clinician review', citationUrl: '/docs/selfcare-guidance.md' });
    }
  }
  if (screening.selfCareAlert) {
    triggered.push({ id: 'SC-ANSWER', label: screening.selfCareAlert.question, citation: 'Patient-reported self-care warning sign; supplied draft — needs clinician review', citationUrl: '/docs/selfcare-guidance.md' });
  }
  const missingSafety: string[] = [];
  for (const rule of RED_FLAG_RULES) {
    if (rule.screeningKey && !['yes', 'no'].includes(screening.answers[rule.screeningKey])) missingSafety.push(rule.label);
  }
  return { triggered, missingSafety, ruleVersion: RULE_VERSION };
}

const SELFCARE_TEXT_RULES = [
  { id: 'SC-BREATH', label: 'Trouble breathing', patterns: [/trouble breathing/i, /difficulty breathing/i, /breathing difficulty/i] },
  { id: 'SC-WAKE', label: 'Unconscious, very drowsy or cannot be woken', patterns: [/unconscious/i, /very drowsy/i, /cannot be wo(?:ken|ke)/i, /can'?t wake/i, /very sleepy/i] },
  { id: 'SC-HEAD', label: 'Sudden severe or worst headache', patterns: [/sudden.{0,15}severe headache/i, /worst headache/i] },
  { id: 'SC-BLEED', label: 'Heavy bleeding that does not stop', patterns: [/bleed(?:ing)?.{0,35}(?:won'?t stop|does not stop|not stopping)/i] },
  { id: 'SC-STOOL', label: 'Black or bloody stool', patterns: [/(?:black|bloody) stools?/i, /blood in (?:the |my )?stool/i] },
  { id: 'SC-BITE', label: 'Snake bite or swallowed chemical/unknown substance', patterns: [/snake ?bite/i, /(?:swallow(?:ed|ing)?|drank).{0,30}(?:chemical|unknown substance)/i] },
  { id: 'SC-ALLERGY', label: 'Swelling of face or throat', patterns: [/(?:face|throat).{0,15}(?:swelling|swollen)/i, /swelling of (?:the )?(?:face|throat)/i] },
  { id: 'SC-PREG', label: 'Pregnancy warning sign', patterns: [/pregnan.{0,60}(?:bleeding|severe belly pain|reduced baby movement|fits)/i] },
  { id: 'SC-DEHYDRATION', label: 'Cannot drink, sunken eyes or no urine for 8 hours', patterns: [/cannot drink/i, /can'?t drink/i, /sunken eyes/i, /no urine for (?:8|eight|9|nine|1\d|2\d) hours/i] },
  { id: 'SC-HEAT', label: 'Very high body temperature or hot dry skin with no sweating', patterns: [/very high body temperature/i, /hot dry skin/i] },
  { id: 'SC-BURN', label: 'Chemical or electrical burn', patterns: [/(?:chemical|electrical|electric) burns?/i] },
];

