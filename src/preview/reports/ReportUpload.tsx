import { useEffect, useRef, useState } from 'react';
import { Camera, FileUp } from 'lucide-react';
import { Button } from '../../components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog.tsx';
import { textReport, type Observation, type Report } from './parser.ts';
import { syntheticReport } from '../fixtures.ts';

export function SourcePage({ report, observation }: { report: Report; observation: Observation }) {
  const page = report.pages[observation.source.page - 1];
  const box = observation.source.region;
  return <div className="report-source">
    <p>Page {observation.source.page}, line {observation.source.line} · original source</p>
    {page.image ? <div className="relative mt-3"><img src={page.image} alt={`Original report page ${observation.source.page}`} className="block w-full" />
      {box && <div aria-label="Highlighted source region" className="absolute border-2 border-green-700 bg-green-300/25" style={{ left: `${box.x / page.width * 100}%`, top: `${box.y / page.height * 100}%`, width: `${box.width / page.width * 100}%`, height: `${box.height / page.height * 100}%` }} />}
    </div> : <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-green-50 p-4">{page.lines.map(l => `${l.line} │ ${l.text}`).join('\n')}</pre>}
    <p className="mt-3 text-sm">{observation.source.text}</p>
    {!box && page.image && <p>Precise region unavailable; no location has been invented.</p>}
  </div>;
}

export function ReportUpload({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (report: Report) => void }) {
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Observation | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { if (!open) { controller.current?.abort(); setBusy(false); setDraft(null); setSelected(null); setError(''); setStatus(''); setText(''); setTab('file'); } return () => { controller.current?.abort(); }; }, [open]);
  function close() { controller.current?.abort(); onClose(); }
  async function fileSelected(file?: File) {
    if (!file) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setDraft(null); setSelected(null); setProgress(0); setStatus('');
    try {
      const { extractFile } = await import('./extract.ts');
      const result = await extractFile(file, (p, s) => { if (!abort.signal.aborted) { setProgress(p); setStatus(s); } }, abort.signal);
      if (!abort.signal.aborted) setDraft(result);
    } catch (e) { if (!abort.signal.aborted) setError(`${(e as Error).message} You can paste text instead.`); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  function update(id: string, key: 'name' | 'value' | 'unit', value: string) { setDraft(d => d ? { ...d, observations: d.observations.map(o => o.id === id ? { ...o, [key]: value, corrected: true } : o) } : d); }
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}><DialogContent className="report-sheet">
    <div className="report-header">
    <DialogTitle className="text-xl font-semibold">Add your report</DialogTitle>
    <DialogDescription>PDF, JPG, PNG or text · up to 10 MB. OCR runs on this device; report content is not uploaded.</DialogDescription>
    </div><div className="report-body">
    <div className="flex gap-2" role="tablist" aria-label="Report input"><Button role="tab" aria-selected={tab === 'file'} variant={tab === 'file' ? 'default' : 'outline'} onClick={() => setTab('file')}>Upload / camera</Button><Button role="tab" aria-selected={tab === 'text'} variant={tab === 'text' ? 'default' : 'outline'} onClick={() => setTab('text')}>Paste text instead</Button></div>
    {tab === 'file' ? <div className="space-y-3">
      <label className="upload-target"><FileUp /><span>Choose file<small>PDF, JPG or PNG</small></span><input aria-label="Choose report file" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e => { void fileSelected(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <label className="upload-target"><Camera /><span>Take a photo<small>Use your device camera</small></span><input aria-label="Take report photo" type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy} onChange={e => { void fileSelected(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <a href="/synthetic-report.png" download className="inline-block min-h-12 py-3 underline">Download synthetic sample image</a>
      <p className="text-sm">OCR currently reads English report labels. Poor scans or other scripts may need pasted text. A 15-page processing limit protects mobile memory.</p>
    </div> : <div className="space-y-3"><label htmlFor="report-paste">Original report text</label><textarea id="report-paste" rows={5} maxLength={20000} value={text} onChange={e => setText(e.target.value)} /><Button variant="outline" onClick={() => setText(syntheticReport)}>Fill synthetic example</Button><Button disabled={!text.trim() || busy} onClick={() => { setDraft(textReport('Pasted report', text)); setError(''); }}>Extract for review</Button></div>}
    {busy && <div role="status" className="space-y-2"><p>{status || 'Preparing local extraction…'}</p><progress className="w-full accent-green-700" max={1} value={progress} /><Button variant="outline" onClick={() => { controller.current?.abort(); setBusy(false); setStatus('Cancelled'); }}>Cancel extraction</Button></div>}
    {error && <p role="alert" className="rounded-xl border border-green-300 p-3">{error}</p>}
    {draft && <div className="space-y-4"><h3 className="font-semibold">Review extracted values</h3><p>Unverified extraction, no medical interpretation. Correct or delete before saving. Corrections retain the original source.</p>
      {draft.pages.some(p => p.lines.some(l => l.confidence !== undefined && l.confidence < 80)) && <p role="status">Some source text has low OCR confidence. Check the original page or use paste text instead.</p>}
      {!draft.observations.length && <p role="status">No supported values extracted. Nothing has been invented. Try clearer text or paste text instead.</p>}
      {draft.observations.map(o => <div key={o.id} className="space-y-2 rounded-xl border border-green-100 p-3">
        {o.source.confidence !== undefined && o.source.confidence < 80 && <p className="font-semibold">Low OCR confidence ({Math.round(o.source.confidence)}%). Check the original carefully.</p>}
        {(['name', 'value', 'unit'] as const).map(key => <label key={key} className="block text-sm">{key}<input aria-label={`Observation ${key}`} value={o[key]} onChange={e => update(o.id, key, e.target.value)} /></label>)}
        {o.corrected && <p className="text-sm">Patient-edited · still unverified. Original: {o.original.name}: {o.original.value} {o.original.unit}</p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelected(o)}>View source line {o.source.line}</Button><Button variant="ghost" onClick={() => { setDraft(d => d ? { ...d, observations: d.observations.filter(v => v.id !== o.id) } : d); if (selected?.id === o.id) setSelected(null); }}>Delete value</Button></div>
      </div>)}
      {selected && <SourcePage report={draft} observation={selected} />}
      <Button disabled={busy || draft.observations.some(o => !o.name.trim() || !o.value.trim())} onClick={() => { onSave(draft); setDraft(null); setSelected(null); }}>Save reviewed report</Button>
    </div>}
    </div><div className="report-footer"><Button variant="outline" onClick={close}>Cancel</Button><span>Nothing is attached until you save.</span></div>
  </DialogContent></Dialog>;
}