import type { Report, ReportLine, ReportPage } from './parser.ts';
import { parseReportLines } from './parser.ts';

export async function extractFile(file: File, progress: (value: number, status: string) => void, signal: AbortSignal): Promise<Report> {
  if (file.size > 10 * 1024 * 1024) throw new Error('This report is larger than 10 MB. Please choose a smaller file or paste text instead.');
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!pdf && !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a PDF, JPG or PNG report.');
  const pages: ReportPage[] = [];
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;
  const check = () => { if (signal.aborted) throw new DOMException('Extraction cancelled', 'AbortError'); };
  const terminate = () => { void worker?.terminate().catch(() => {}); };
  signal.addEventListener('abort', terminate);
  async function ocr(canvas: HTMLCanvasElement, page: number): Promise<ReportLine[]> {
    check();
    if (!worker) {
      progress(0.05, 'Loading on-device OCR…');
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
        logger: m => { if (m.status === 'recognizing text') progress(m.progress, `Reading page ${page} on this device…`); },
      });
    }
    check();
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    check();
    const extracted = data.blocks?.flatMap(block => block.paragraphs.flatMap(p => p.lines)) ?? [];
    return extracted.map((line, i) => ({ page, line: i + 1, text: line.text.trimEnd(), confidence: line.confidence,
      region: { x: line.bbox.x0, y: line.bbox.y0, width: line.bbox.x1 - line.bbox.x0, height: line.bbox.y1 - line.bbox.y0 } }));
  }
  try {
    if (pdf) {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
      const abortPdf = () => { void task.destroy(); };
      signal.addEventListener('abort', abortPdf);
      try {
        const doc = await task.promise;
        if (doc.numPages > 15) throw new Error('Please choose a report with 15 pages or fewer, or paste the relevant text.');
        for (let n = 1; n <= doc.numPages; n++) {
          check(); progress((n - 1) / doc.numPages, `Reading PDF page ${n} of ${doc.numPages}…`);
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 1.5 });
          if (viewport.width * viewport.height > 24000000) throw new Error('This PDF page is too large to render safely. Paste the relevant text instead.');
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          const content = await page.getTextContent();
          const groups = new Map<number, { x: number; y: number; width: number; height: number; text: string }[]>();
          for (const item of content.items) {
            if (!('str' in item) || !item.str.trim()) continue;
            const t = pdfjs.Util.transform(viewport.transform, item.transform);
            const height = Math.hypot(t[2], t[3]);
            const row = Math.round(t[5] / 4) * 4;
            const parts = groups.get(row) ?? [];
            parts.push({ x: t[4], y: t[5] - height, width: item.width * viewport.scale, height, text: item.str }); groups.set(row, parts);
          }
          let lines: ReportLine[] = Array.from(groups.entries()).sort(([a], [b]) => a - b).map(([, parts], i) => {
            parts.sort((a, b) => a.x - b.x);
            const x = Math.min(...parts.map(p => p.x)), y = Math.min(...parts.map(p => p.y));
            return { page: n, line: i + 1, text: parts.map(p => p.text).join(' '), region: { x, y, width: Math.max(...parts.map(p => p.x + p.width)) - x, height: Math.max(...parts.map(p => p.y + p.height)) - y } };
          });
          if (!lines.length) lines = await ocr(canvas, n);
          pages.push({ image: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, lines });
          page.cleanup();
        }
      } finally { signal.removeEventListener('abort', abortPdf); await task.destroy(); }
    } else {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 24000000) throw new Error('This image is too large to process safely. Choose a smaller image or paste text.');
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        const lines = await ocr(canvas, 1);
        pages.push({ image: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, lines });
      } finally { bitmap.close(); }
    }
    check(); progress(1, 'Ready for your review');
    return { name: file.name, pages, observations: parseReportLines(pages.flatMap(p => p.lines)) };
  } finally { signal.removeEventListener('abort', terminate); const activeWorker = worker as Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null; await activeWorker?.terminate().catch(() => {}); }
}