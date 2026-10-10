# SEHAT OS: Village Self-Care Guidance

Draft v1 for clinician review. Synthetic hackathon project. Not a diagnostic tool and not a substitute for a doctor.

## 1. Purpose
When a patient lives far from a hospital, the AI can offer temporary comfort measures and clear instructions on when to stop home care and go for help. It never diagnoses, never says symptoms are harmless, and never gives medicine doses.
This document is the content whitelist supplied for review, not evidence of clinician approval. Anything not written here must not be advised. Say "I can't advise on that, please speak to a health worker or doctor" and continue with the normal booking flow, subject to existing safety gates.

## 2. Rules for the AI
1. Red flags first. Run the deterministic red-flag check before showing any self-care text. If any red flag matches, show the emergency screen and no self-care advice.
2. No diagnosis. Never say "you have X". Say "these symptoms can have many causes".
3. No medicine names or doses. For fever or pain relief, say: "Ask a pharmacist, ASHA worker or doctor which medicine is safe for you." The one exception is ORS (oral rehydration salts), prepared exactly as the packet says.
4. Lower the threshold for high-risk people. If the patient is an infant under 3 months, a child under 5, pregnant, over 65, or has a long-term illness (diabetes, heart, kidney, asthma, immune problems), do not give home-care advice. Route to a doctor.
5. Always end with a time limit. Every topic states when to seek care if things don't improve.
6. Ask before advising. Ask the follow-up questions listed under each topic. Mark unanswered answers as "not asked", never assume.
7. Say where the advice comes from. Show "General first-aid guidance, reviewed by: ______ (date)" only after actual review. Until then display "Needs clinician review — not for patient use".
8. Local language. Provide every message in English, Hindi and Assamese. Have a native speaker and a clinician review translations before demo use. TODO translations must not be displayed as guidance.

## 3. Universal emergency signs (go now, do not wait)
- Chest pain or pressure, especially with sweating or pain spreading to arm or jaw
- Trouble breathing, gasping, blue lips
- Unconscious, very drowsy, confused, or cannot be woken
- Seizure (fits) that is new, lasts more than a few minutes, or repeats
- Face drooping, arm or leg weakness, slurred speech, sudden severe headache (possible stroke)
- Heavy bleeding that does not stop with firm pressure
- Vomiting blood or passing black or bloody stool
- Snake bite, poisoning, or swallowing a chemical or unknown substance
- Swelling of face or throat, or hives with trouble breathing (severe allergy)
- Pregnancy with bleeding, severe belly pain, fits, or reduced baby movement
- Fever in a baby under 3 months
- Signs of severe dehydration: very sleepy, no urine for 8 hours or more, sunken eyes, cannot drink
- Thoughts of self-harm or suicide

Screen text: "This may be an emergency. Please go to the nearest hospital or call for an ambulance now. Do not wait."
Verify 112 and the local ambulance number against official sources before displaying them. No local number has been verified for this draft.

## 4. Approved topics (whitelist supplied for review)

### 4.1 Fever
Ask first: Who is it for (age)? How many days? Any stiff neck, rash, fits, breathing trouble? Chills and shivering? Recent mosquito exposure?
Comfort measures:
- Rest in a cool, ventilated room
- Drink plenty of clean fluids (boiled and cooled water, ORS, rice water, soup)
- Wear light clothing. Remove extra blankets
- Lukewarm (not cold) sponging of the forehead and body can feel soothing
Avoid: Cold water or ice baths. Alcohol rubs. Giving any medicine without asking a pharmacist or health worker.
Seek care: Fever lasting more than 2 days, or at any time with severe headache, stiff neck, rash, trouble breathing, persistent vomiting, confusion or fits.
Assam note: In and after the monsoon, fever with chills, body pain or severe headache can be malaria or dengue. Do not wait it out. Get tested at the nearest health centre.

### 4.2 Cough, cold and sore throat
Ask first: Duration? Any breathing difficulty, chest pain, wheezing, coughing blood? Fever? Age?
Comfort measures:
- Rest and warm fluids (warm water, soup)
- Gargle with warm salt water for sore throat
- Steam inhalation only for adults, carefully, with no hot water near children
- Keep the head slightly raised when sleeping
Avoid: Smoke, dust, cold drinks. Giving honey to infants under 1 year.
Seek care: Cough lasting more than 2 weeks (needs TB checking), breathing difficulty, fast breathing in a child, chest pain, coughing blood, or high fever lasting more than 2 days.

### 4.3 Headache
Ask first: Sudden or gradual? Worst headache of life? Any fever, stiff neck, vomiting, vision change, weakness, head injury, or confusion?
Comfort measures:
- Rest in a quiet, dim room
- Drink water. Many headaches are linked to dehydration or missed meals
- A cool cloth on the forehead or neck
- Gentle neck and shoulder stretching
Avoid: Screens, loud noise, skipping meals. Giving any medicine without advice from a pharmacist or doctor.
Seek care: Sudden severe headache, headache after a head injury, with fever and stiff neck, with vomiting, vision change, weakness or confusion (emergency), or headaches that keep returning for several days.

### 4.4 Loose motions (diarrhoea) and dehydration
Ask first: Age? How many days? Any blood in stool? Vomiting? Can the person drink? Passing urine normally?
Comfort measures:
- ORS (oral rehydration solution): mix exactly as the packet says, using clean boiled and cooled water, and give small, frequent sips
- Continue breastfeeding for babies and normal eating when possible
- Wash hands with soap before eating and after the toilet
Avoid: Fizzy drinks, packaged juices, unboiled water, stopping food completely. Giving anti-diarrhoea medicines without advice.
Seek care: Blood in stool, loose motions more than 2 days, cannot keep fluids down, very sleepy, sunken eyes, very dry mouth, or little or no urine. Children, elderly and pregnant women should be seen early.

### 4.5 Vomiting or upset stomach
Ask first: Duration? Blood in vomit? Severe belly pain? Fever? Able to drink? Pregnant?
Comfort measures:
- Rest, then sip small amounts of ORS or clean water often
- Once vomiting settles, start with plain foods (rice, banana, toast)
Avoid: Oily, spicy food, large meals, alcohol.
Seek care: Vomiting blood, severe or worsening belly pain, cannot keep any fluid down for more than 12 to 24 hours, signs of dehydration, or vomiting after a head injury.

### 4.6 Minor cuts and scrapes
Ask first: How deep? Is bleeding stopping? Caused by dirty metal, animal, or soil? Last tetanus shot?
Comfort measures:
- Press firmly with a clean cloth for 10 minutes to stop bleeding
- Rinse with clean running water and mild soap
- Cover with a clean dry bandage and change it daily
Avoid: Putting soil, ash, turmeric paste, or other home powders on an open wound.
Seek care: Bleeding that won't stop, deep or gaping wound, animal or human bite, rusty or dirty object, or signs of infection (spreading redness, pus, swelling, fever). Ask a health worker about tetanus protection.

### 4.7 Minor burns
Ask first: What caused it (fire, hot liquid, chemical, electric)? How large? Where on the body? Age?
Comfort measures (small, superficial burns only):
- Hold under cool, not ice-cold, running water for about 20 minutes
- Remove rings and tight items before swelling starts
- Cover loosely with a clean non-fluffy cloth
Avoid: Ice, butter, oil, toothpaste, ink or home powders. Bursting blisters.
Seek care: Burns larger than the person's palm, on the face, hands, feet or private parts, deep or white or blackened burns, chemical or electrical burns, or any burn in a baby, child or elderly person (go now).

### 4.8 Sprain, strain and body ache
Ask first: How did it happen? Can the person bear weight? Any deformity, numbness or severe swelling?
Comfort measures:
- Rest the area
- Cool cloth for 15 to 20 minutes at a time in the first 1 to 2 days
- Gentle compression with a bandage, not too tight
- Raise the limb above heart level
Avoid: Massaging a fresh injury hard, walking on it if painful.
Seek care: Cannot bear weight, obvious deformity, numbness, severe swelling, or no improvement in 3 days.

### 4.9 Heat exhaustion (summer)
Ask first: Was the person in the sun or doing heavy work? Dizzy, weak, nauseous, very thirsty? Confused?
Comfort measures:
- Move to shade or a cool place, loosen clothing
- Sip water or ORS slowly
- Cool the skin with a wet cloth or fan
Avoid: Going back to work in the heat the same day.
Seek care: Confusion, fainting, very high body temperature, hot dry skin with no sweating (emergency, possible heatstroke), or no improvement within 30 to 60 minutes.

## 5. How the AI should phrase self-care
1. Empathy in one line ("I'm sorry you're not feeling well.")
2. "Based on what you told me" (list the patient's own words)
3. "While you wait to see a doctor, these may help:" (comfort measures)
4. "Please avoid:" (avoid list)
5. "Get help urgently if:" (red flags for that topic, shown prominently)
6. "I can book you a doctor now." (button; existing booking restrictions still apply)
7. Footer: "General guidance, not a diagnosis. Reviewed by: ______"

## 6. Provenance tagging for self-care
- Patient statements: tagged Patient reported
- Advice text: tagged General guidance (reviewed), never mixed with patient facts
- Anything not asked: tagged Not yet asked
- Self-care text must never be stored as part of the patient's medical record

## 7. Suggested data format
Each topic becomes one JSON entry: id; title (en/hi/as); ask_first[] (en/hi/as); comfort_measures[] (en/hi/as); avoid[] (en/hi/as); see_doctor_if[] and go_now_if[] (en/hi/as); max_days_before_care; excluded_groups[] (infant, under5, pregnant, over65, chronic); reviewed_by; reviewed_on.
Only show a topic when no red flag and no excluded-group match is present.
Implementation metadata may add stable question IDs, answer types, deterministic escalation conditions, symptom terms, and timing units. Do not invent thresholds where this draft is vague. Minor cuts and burns have no general waiting deadline in the supplied text; headache says "several days". These need clinician clarification before release.

## 8. Review and sources
Before any real use, a licensed clinician must review every line. Cite verified sources in the README and keep the needs-review note visible. Suggested sources to verify: WHO; Ministry of Health and Family Welfare (India)/National Health Mission; IMNCI; Red Cross; Assam health advisories for malaria, dengue and heat.
No clinician validation or native-speaker review has been supplied. Some content (including steam inhalation and regional disease wording) requires explicit review; the whitelist is not clinical endorsement.
Implementation source comparison: British Red Cross burns first aid at https://www.redcross.org.uk/first-aid/learn-first-aid/burns was fetched successfully. It is not validation of the entire supplied document. https://112.gov.in/ could not be fetched; emergency numbers are not presented as verified in the module.

## 9. Known limits
- General content cannot account for each patient's conditions or medicines
- Assamese translations require a fluent speaker
- Emergency numbers and local facilities require verification
- Refuse topics outside the list rather than improvise