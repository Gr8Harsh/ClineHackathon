import { useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, Square, X } from 'lucide-react';
import { Button } from '../components/ui/button.tsx';
import { speechLocales, type PreviewLanguage } from './fixtures.ts';

type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
export function VoiceScreen({ language, onLanguage, onClose, onText }: { language: PreviewLanguage; onLanguage: (l: PreviewLanguage) => void; onClose: () => void; onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => { return () => { recognition.current?.abort(); }; }, []);
  useEffect(() => { recognition.current?.abort(); setListening(false); }, [language]);
  function record() {
    if (listening) { recognition.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) { setError('Voice is unavailable in this browser. Switch to the keyboard to continue.'); return; }
    const r = new Constructor(); recognition.current = r; r.lang = speechLocales[language]; r.interimResults = true;
    setError(''); setTranscript('');
    r.onresult = e => setTranscript(Array.from(e.results).map(result => result[0].transcript).join(' '));
    r.onerror = e => { setError(`We couldn’t continue voice input (${e.error}). This language or microphone may be unavailable. Please use the keyboard.`); setListening(false); };
    r.onend = () => setListening(false);
    try { r.start(); setListening(true); } catch { setError('Please check microphone permissions or switch to the keyboard.'); }
  }
  return <div className="voice-screen" aria-label="Voice input">
    <header className="flex items-center justify-between p-5"><Button variant="ghost" onClick={onClose} aria-label="Close voice"><X /></Button><strong>Voice chat</strong><span className="w-12" /></header>
    <div className="flex justify-center gap-2" role="group" aria-label="Voice language">{(['EN', 'HI', 'AS'] as PreviewLanguage[]).map(l => <Button key={l} variant="ghost" aria-pressed={language === l} onClick={() => onLanguage(l)}>{l === 'EN' ? 'EN' : l === 'HI' ? 'हिन्दी' : 'অসমীয়া'}</Button>)}</div>
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center"><p>{listening ? 'I’m listening. Take your time.' : 'Your words, at your pace.'}</p><div className={`voice-orb ${listening ? 'listening' : ''}`} aria-hidden="true"><Mic size={46} /></div><p aria-live="polite" className="min-h-20 text-lg">{transcript || 'Tap the microphone when you’re ready.'}</p>{error && <p role="alert">{error}</p>}</div>
    <div className="px-6 text-center text-sm"><p>Transcripts are editable and never automatically sent.</p><p className="mt-2">Browser speech may use external processing. Language selection does not guarantee recognition.</p></div>
    <div className="flex items-center justify-around px-8 py-8"><Button variant="outline" size="icon" aria-label="Switch to text chat" onClick={() => { recognition.current?.abort(); onText(transcript); }}><Keyboard /></Button><Button className="!size-20 !rounded-full" aria-label={listening ? 'Stop voice recording' : 'Start voice recording'} aria-pressed={listening} onClick={record}>{listening ? <Square /> : <Mic />}</Button><Button variant="outline" size="icon" aria-label="Close voice input" onClick={onClose}><X /></Button></div>
  </div>;
}