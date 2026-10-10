export type PreviewLanguage = 'EN' | 'HI' | 'AS';
export type Scenario = 'routine' | 'emergency' | 'no-slots' | 'conflict' | 'expired';
export type FieldId = 'concern' | 'duration' | 'history' | 'medications' | 'allergies';
export type EvidenceField = { key: FieldId; label: string; value: string | null; sourceId: string | null; choiceSourceId?: string };
export type ChatLine = { id: string; role: 'patient' | 'assistant'; text: string; language: PreviewLanguage };

export const questions: { key: FieldId | 'document'; text: string; chips: string[] }[] = [
  { key: 'concern', text: 'What would you like the doctor to know? Tell me in your own words.', chips: ['I have had a headache', 'I want to discuss a report'] },
  { key: 'duration', text: 'How long has this been happening?', chips: ['Since today', 'For 3 days', 'For a few weeks', 'Not sure'] },
  { key: 'history', text: 'Is there any medical history you would like to share?', chips: [] },
  { key: 'medications', text: 'Are you taking any medicines regularly?', chips: [] },
  { key: 'allergies', text: 'Do you have any allergies the doctor should know about?', chips: [] },
  { key: 'document', text: 'Do you have a lab report you would like to share? It is optional. I can show its source text alongside the extracted value.', chips: ['Add a text report', 'I don’t have a report'] },
];
export const initialFields: EvidenceField[] = [
  { key: 'concern', label: 'Main concern', value: null, sourceId: null },
  { key: 'duration', label: 'Duration', value: null, sourceId: null },
  { key: 'history', label: 'Medical history', value: null, sourceId: null },
  { key: 'medications', label: 'Current medicines', value: null, sourceId: null },
  { key: 'allergies', label: 'Allergies', value: null, sourceId: null },
];
export const doctors = [
  { id: 'roy', name: 'Dr. Ananya Roy', initials: 'AR', specialty: 'General medicine', location: 'Guwahati', languages: 'Assamese · English', fee: 500, times: ['10:00 AM', '11:30 AM', '3:00 PM'] },
  { id: 'hoque', name: 'Dr. Imran Hoque', initials: 'IH', specialty: 'General medicine', location: 'Dhubri', languages: 'Assamese · Hindi · English', fee: 350, times: ['10:30 AM', '2:00 PM', '4:00 PM'] },
  { id: 'adams', name: 'Dr. Mariana Adams', initials: 'MA', specialty: 'Neurology', location: 'Guwahati', languages: 'English', fee: 500, times: ['11:00 AM', '3:00 PM'] },
  { id: 'james', name: 'Dr. Peter James', initials: 'PJ', specialty: 'General medicine', location: 'Guwahati', languages: 'English', fee: 450, times: ['9:00 AM', '2:00 PM'] },
  { id: 'maxwell', name: 'Dr. Maxwell Nil', initials: 'MN', specialty: 'Radiology', location: 'Dhubri', languages: 'Hindi · English', fee: 500, times: ['10:00 AM'] },
  { id: 'wills', name: 'Dr. Kate Wills', initials: 'KW', specialty: 'Oncology', location: 'Guwahati', languages: 'English', fee: 600, times: ['11:30 AM', '4:00 PM'] },
  { id: 'isaac', name: 'Dr. Isaac James', initials: 'IJ', specialty: 'General medicine', location: 'Dhubri', languages: 'English', fee: 400, times: ['2:30 PM'] },
];
export const greetings: Record<PreviewLanguage, string> = {
  EN: 'Hello! Let’s get you ready for a consultation.',
  HI: 'नमस्ते! आइए परामर्श की तैयारी करें।',
  AS: 'নমস্কাৰ! আহক পৰামৰ্শৰ বাবে প্ৰস্তুতি কৰোঁ।',
};
export const speechLocales: Record<PreviewLanguage, string> = { EN: 'en-IN', HI: 'hi-IN', AS: 'as-IN' };
// No synthetic translation claims: non-English originals are displayed as-is.
export const syntheticReport = '\nSYNTHETIC DEMO REPORT\nHaemoglobin: 13.2 g/dL\n';