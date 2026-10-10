import { useEffect, useRef, useState } from 'react';
import type { Language } from '../../shared/types.ts';

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};
const LOCALE: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', as: 'as-IN' };

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech input. The transcript goes into the editable text box and is
 * never sent automatically. Setting as-IN does not prove Assamese recognition
 * works: most browsers do not support it, so we say so up front.
 */
export function VoiceInput({ language, disabled, onText }: { language: Language; disabled: boolean; onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null;
  useEffect(() => () => rec.current?.stop(), []);

  function toggle() {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = LOCALE[language]; r.interimResults = false; r.continuous = false;
    r.onresult = e => { const t = Array.from(e.results).map(x => x[0]?.transcript ?? '').join(' ').trim(); if (t) onText(t); };
    r.onerror = e => setError(e.error === 'language-not-supported'
      ? `This browser cannot recognise ${language === 'as' ? 'Assamese' : 'this language'} speech. Please type instead.`
      : e.error === 'not-allowed' ? 'Microphone permission was denied.' : `Voice input failed (${e.error}). Please type instead.`);
    r.onend = () => setListening(false);
    rec.current = r; setError(''); setListening(true);
    try { r.start(); } catch { setListening(false); setError('Voice input could not start.'); }
  }

  if (!supported) return <span className="meta">Voice input is not available in this browser; typing always works.</span>;
  return <>
    <button type="button" className={`btn btn-ghost btn-sm ${listening ? 'mic-on' : ''}`} disabled={disabled} aria-pressed={listening} onClick={toggle}>
      {listening ? '● Listening… tap to stop' : '🎤 Speak'}
    </button>
    {language === 'as' && <span className="meta">Assamese speech recognition is not reliably supported by browsers: check the text before sending, or type.</span>}
    {language !== 'as' && <span className="meta">Speech may be processed by your browser vendor. Check the text before sending.</span>}
    {error && <span className="meta" role="alert">{error}</span>}
  </>;
}
