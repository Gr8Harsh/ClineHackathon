import type { FieldId, PreviewLanguage } from './fixtures.ts';

export type AnswerAction = 'yes' | 'no' | 'unsure' | 'skip';
export const answerLabels: Record<PreviewLanguage, Record<'history' | 'medications' | 'allergies', string[]>> = {
  EN: {
    medications: ['Yes, I take some', 'No, I take none', 'Not sure', 'Skip for now'],
    allergies: ['Yes, I have allergies', 'No known allergies', 'Not sure', 'Skip for now'],
    history: ['Yes, I have a medical history', 'No history to report', 'Not sure', 'Skip for now'],
  },
  HI: {
    medications: ['हाँ, कुछ दवाइयाँ लेता/लेती हूँ', 'नहीं, कोई नियमित दवा नहीं', 'पक्का नहीं', 'अभी छोड़ें'],
    allergies: ['हाँ, मुझे एलर्जी है', 'कोई ज्ञात एलर्जी नहीं', 'पक्का नहीं', 'अभी छोड़ें'],
    history: ['हाँ, पिछली स्वास्थ्य जानकारी है', 'बताने के लिए कोई इतिहास नहीं', 'पक्का नहीं', 'अभी छोड़ें'],
  },
  AS: {
    medications: ['হয়, কিছুমান ঔষধ খাওঁ', 'নিয়মিত ঔষধ নাখাওঁ', 'নিশ্চিত নহয়', 'এতিয়া বাদ দিয়ক'],
    allergies: ['হয়, মোৰ এলাৰ্জি আছে', 'কোনো জনা এলাৰ্জি নাই', 'নিশ্চিত নহয়', 'এতিয়া বাদ দিয়ক'],
    history: ['হয়, আগৰ স্বাস্থ্যৰ তথ্য আছে', 'ক’বলগীয়া ইতিহাস নাই', 'নিশ্চিত নহয়', 'এতিয়া বাদ দিয়ক'],
  },
};
export const detailsPrompt: Record<PreviewLanguage, string> = { EN: 'Which ones? Tell me in your own words.', HI: 'कौन सी? अपने शब्दों में बताइए।', AS: 'কোনবোৰ? আপোনাৰ নিজৰ শব্দত কওক।' };
export function structuredAnswer(key: FieldId, action: AnswerAction): string | null {
  if (action === 'skip' || action === 'yes') return null;
  if (action === 'unsure') return 'Patient unsure';
  return key === 'medications' ? 'No regular medicines (patient said none)' : key === 'allergies' ? 'No known allergies (patient said none)' : 'No medical history reported (patient said none)';
}