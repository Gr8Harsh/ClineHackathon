import type { Message } from '../../shared/types.ts';

export function MessageEvidence({ message }: { message: Message }) {
  const author = message.role === 'patient'
    ? message.enteredBy === 'health-worker' ? 'Patient’s words · entered by health worker' : 'Patient original'
    : 'Assistant response';
  return <>
    <div>{message.text}</div>
    <span className="meta">{author} · {new Date(message.createdAt).toLocaleString()}</span>
    {import.meta.env?.DEV && message.replyOrigin === 'fixture' && <small title={message.fallbackReason ?? 'Deterministic response'}>fixture</small>}
    {message.replyOrigin === 'safety' && <small>Server safety response</small>}
    {message.english && <div className="translation">
      <strong>English rendering · {message.translation === 'fixture' ? 'synthetic phrasebook, not live translation' : 'machine-translated, unverified'}</strong>
      <div lang="en">{message.english}</div>
    </div>}
    {!message.english && message.language !== 'en' && message.role === 'patient' && <span className="meta">English rendering unavailable. Original shown; language labels do not establish translation quality.</span>}
  </>;
}
