import type { Message } from '../../shared/types.ts';

export function MessageEvidence({ message }: { message: Message }) {
  return <>
    <div>{message.text}</div>
    <span className="meta">{message.role === 'patient' ? 'Patient original' : 'Assistant response'} · {new Date(message.createdAt).toLocaleString()}</span>
    {message.english && <div className="translation">
      <strong>English rendering · {message.translation === 'fixture' ? 'synthetic fixture, not live translation' : 'unverified'}</strong>
      <div lang="en">{message.english}</div>
    </div>}
    {!message.english && message.language !== 'en' && <span className="meta">English rendering unavailable. Original shown; language labels do not establish translation quality.</span>}
  </>;
}