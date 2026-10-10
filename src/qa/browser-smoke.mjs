// Dependency-free UI regression checks. Run after npm run build:
// node src/qa/browser-smoke.mjs
// Uses installed Chrome/Edge, isolated synthetic SQLite, and a temporary browser profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'sehat-browser-'));
const output = resolve(root, 'test-results');
mkdirSync(output, { recursive: true });
const executable = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
const port = Number(process.env.QA_PORT ?? 3017);
const debugPort = Number(process.env.QA_DEBUG_PORT ?? 9237);
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT: String(port), SEHAT_DB: join(temp, 'demo.db') };
delete env.ANTHROPIC_API_KEY; delete env.CLINE_API_KEY; delete env.SEHAT_TEST;
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, env, stdio: 'pipe' });
let serverLog = '';
server.stderr.on('data', b => { serverLog += b; });
server.stdout.on('data', b => { serverLog += b; });
let browser;
let socket;
let count = 0;
const results = [];
const errors = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await fn()) return; } catch { /* retry readiness only */ }
    await pause(75);
  }
  throw new Error(`Timed out: ${label}`);
}
async function api(path, body) {
  const r = await fetch(base + '/api' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${await r.text()}`);
  return r.json();
}
function passed(name) { results.push({ name, passed: true }); console.log('PASS', name); }
try {
  await until(() => fetch(base + '/api/health').then(r => r.ok), 'API start');
  browser = spawn(executable, ['--headless=new', `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${join(temp, 'chrome')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let target;
  await until(async () => {
    const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
    target = pages.find(p => p.type === 'page'); return target;
  }, 'Chrome start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
  const pending = new Map();
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.id && pending.has(m.id)) {
      const { res, rej, timer } = pending.get(m.id); pending.delete(m.id); clearTimeout(timer);
      if (m.error) rej(new Error(m.error.message)); else res(m.result);
    }
  });
  function cdp(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++count;
      const timer = setTimeout(() => { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { res, rej, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function js(expression) {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  const visible = `e => !!(e.getClientRects().length) && !e.closest('[hidden]')`;
  async function pointer(expression) {
    await js(`(${expression}).scrollIntoView({block:'center',behavior:'instant'})`);
    await pause(80);
    const point = await js(`(()=>{const e=${expression};const r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);
    assert.ok(point.hit, `Pointer target must be visible and unobscured: ${expression}`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await pause(100);
  }
  async function key(key, code = key, modifiers = 0) {
    const windowsVirtualKeyCode = { Escape: 27, Tab: 9, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 }[key];
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    await pause(100);
  }
  async function click(text) {
    await until(() => js(`Array.from(document.querySelectorAll('button')).filter(${visible}).some(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`), `button ${text}`);
    await pointer(`Array.from(document.querySelectorAll('button')).filter(${visible}).find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`);
    await pause(100);
  }
  const text = () => js('document.body.innerText');
  async function fill(id, value) {
    await js(`(()=>{const e=document.getElementById(${JSON.stringify(id)}); const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  async function ready() { await until(() => js(`!!document.getElementById('intake-input')&&!document.getElementById('intake-input').disabled`), 'patient ready'); }
  async function screenshot(name) {
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(output, name + '.png'), Buffer.from(result.data, 'base64'));
  }
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: base + '/?fixture=1' });
  await until(async () => (await text()).includes('How are you feeling'), 'redesigned preview');
  assert.equal(await js(`document.querySelectorAll('.primary-tabs [role="tab"]').length`), 2);
  assert.equal(await js(`document.querySelector('.primary-tabs [aria-selected="true"]').textContent`), 'AI assistant');
  assert.equal(await js(`document.querySelector('.assistant-welcome h2').textContent`), 'How are you feeling?');
  assert.equal(await js(`document.querySelectorAll('.chat-message').length`), 0);
  await screenshot('preview-welcome-desktop');
  const orbFrame = await js(`document.querySelector('.assistant-orb canvas').toDataURL()`);
  await pause(250);
  assert.notEqual(await js(`document.querySelector('.assistant-orb canvas').toDataURL()`), orbFrame);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pause(100);
  const stillFrame = await js(`document.querySelector('.assistant-orb canvas').toDataURL()`);
  await pause(250);
  assert.equal(await js(`document.querySelector('.assistant-orb canvas').toDataURL()`), stillFrame);
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  for (const [width, height] of [[344,747],[390,844],[430,740],[640,450]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'));
    await js('window.scrollTo(0,0)'); await screenshot(`preview-welcome-${width}`);
    assert.ok(await js(`document.querySelector('.assistant-welcome h2').getBoundingClientRect().bottom < document.querySelector('.chat-composer').getBoundingClientRect().top`), 'Welcome heading is not covered by composer');
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await pointer(`document.querySelector('[aria-label="Your answer"]')`);
  await cdp('Input.insertText', { text: 'Unsent synthetic draft' });
  await pointer(`document.getElementById('assistant-tab')`); await key('ArrowRight');
  assert.equal(await js(`document.activeElement.id`), 'patient-tab');
  assert.ok(await js(`!!document.querySelector('.home-screen')`));
  await screenshot('preview-home-desktop');
  await key('ArrowLeft');
  assert.equal(await js(`document.activeElement.id`), 'assistant-tab');
  assert.equal(await js(`document.querySelector('[aria-label="Your answer"]').value`), 'Unsent synthetic draft');
  await js(`(()=>{const e=document.querySelector('[aria-label="Your answer"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  passed('Assistant opens first with two keyboard-accessible tabs, preserved draft, animated green form and reduced-motion fallback');
  assert.ok(!(await text()).includes('A question from your doctor'));
  await pointer(`document.querySelector('[aria-label="Attach a text report"]')`);
  await click('Cancel');
  assert.ok(await js(`!!document.querySelector('.assistant-welcome')`));
  await pointer(`document.querySelector('[aria-label="Your answer"]')`);
  await cdp('Input.insertText', { text: 'I have had a headache' });
  await pointer(`document.querySelector('[aria-label="Send answer"]')`);
  assert.ok(!await js(`!!document.querySelector('.assistant-welcome')`));
  const conversation = await js(`document.querySelector('.chat-scroll').innerText`);
  await pointer(`document.getElementById('patient-tab')`);
  await pointer(`document.getElementById('assistant-tab')`);
  assert.equal(await js(`document.querySelector('.chat-scroll').innerText`), conversation);
  passed('First message transitions from welcome to conversation; tab switching preserves messages and question');
  const attach = `document.querySelector('[aria-label="Attach a text report"]')`;
  const closeDialog = `document.querySelector('[aria-label="Close dialog"]')`;
  const beforeUpload = await js(`document.querySelector('.chat-scroll').innerText`);
  for (const [width,height] of [[1280,900],[390,844],[430,740],[344,747],[390,360],[640,450]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await pointer(attach);
    const conversationPosition = await js('window.scrollY');
    const bounds = await js(`(()=>{const r=document.querySelector('[role="dialog"]').getBoundingClientRect();const c=document.querySelector('.dialog-close').getBoundingClientRect();const f=document.querySelector('.report-footer').getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,closeTop:c.top,footerBottom:f.bottom};})()`);
    assert.ok(bounds.top >= 0 && bounds.left >= 0 && bounds.right <= width + 1 && bounds.bottom <= height + 1 && bounds.closeTop >= 0 && bounds.footerBottom <= height + 1, JSON.stringify(bounds));
    await key('Tab');
    assert.ok(await js(`!!document.activeElement.closest('[role="dialog"]')`));
    await screenshot(`preview-upload-${width}x${height}`);
    await click('Cancel');
    assert.ok(!await js(`!!document.querySelector('[role="dialog"]')`));
    assert.equal(await js(`document.querySelector('.chat-scroll').innerText`), beforeUpload);
    assert.ok(Math.abs(await js('window.scrollY') - conversationPosition) < 2, 'Dismissal preserves conversation scroll position');
    assert.equal(await js(`document.activeElement.getAttribute('aria-label')`), 'Attach a text report');
    await pointer(attach); await pointer(closeDialog);
    await pointer(attach); await key('Escape');
    assert.ok(!await js(`!!document.querySelector('[role="dialog"]')`));
    assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'));
  }
  passed('Upload stays on screen at six viewport sizes; pointer Cancel/X, Escape and focus return preserve the question');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await pointer(attach);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 20, y: 20, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 20, y: 20, button: 'left', clickCount: 1 });
  await until(() => js(`!document.querySelector('[role="dialog"]')`), 'backdrop dismissal');
  await pointer(attach);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 360, deviceScaleFactor: 1, mobile: true });
  const scrollPoint = await js(`(()=>{const r=document.querySelector('.report-body').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: 500 });
  await pause(200);
  assert.ok(await js(`document.querySelector('.report-body').scrollTop>0`));
  await click('Cancel');
  passed('Real wheel scrolling stays inside the upload body while its Cancel footer remains clickable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await pointer(attach);
  await js(`(async()=>{const svg=await fetch('/synthetic-report.svg').then(r=>r.blob());const u=URL.createObjectURL(svg);const bitmap=new Image();bitmap.src=u;await bitmap.decode();const c=document.createElement('canvas');c.width=1000;c.height=650;c.getContext('2d').drawImage(bitmap,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const file=new File([blob],'synthetic-report.png',{type:'image/png'});const d=new DataTransfer();d.items.add(file);const e=document.querySelector('input[aria-label="Choose report file"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));window.qaSamplePng=c.toDataURL('image/png');URL.revokeObjectURL(u);})()`);
  await until(async () => (await text()).includes('Review extracted values'), 'on-device image OCR', 90000);
  assert.ok(await js(`document.querySelectorAll('input[aria-label="Observation value"]').length>=2`));
  await click('View source line 3');
  assert.ok(await js(`!!document.querySelector('[aria-label="Highlighted source region"]')`));
  await click('Save reviewed report');
  passed('Local image OCR extracts actual sample values and exposes original highlighted regions');
  await pointer(attach);
  await js(`(()=>{const d=new DataTransfer();d.items.add(new File([new Uint8Array(10*1024*1024+1)],'oversized.png',{type:'image/png'}));const e=document.querySelector('input[aria-label="Choose report file"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(async () => (await text()).includes('larger than 10 MB'), 'oversized report rejection');
  await click('Cancel'); await pointer(attach);
  assert.ok(!(await text()).includes('larger than 10 MB'));
  await click('Paste text instead');
  await fill('report-paste', 'Unsupported synthetic text only'); await click('Extract for review');
  assert.match(await text(), /No supported values extracted/);
  await fill('report-paste', 'Haemoglobin: 13.2 g/dL'); await click('Extract for review');
  await pointer(`document.querySelector('[aria-label="Observation value"]')`);
  await js(`(()=>{const e=document.querySelector('[aria-label="Observation value"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'13.5');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.match(await text(), /Original: Haemoglobin: 13.2/);
  await click('View source line 1'); await click('Delete value');
  assert.equal(await js(`document.querySelectorAll('.report-source').length`), 0);
  await click('Cancel'); await pointer(attach);
  assert.ok(!(await text()).includes('Review extracted values'));
  await js(`(async()=>{const b=await fetch(window.qaSamplePng).then(r=>r.blob());const d=new DataTransfer();d.items.add(new File([b],'cancelled.png',{type:'image/png'}));const e=document.querySelector('input[aria-label="Choose report file"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(() => js(`!!document.querySelector('.report-sheet progress')`), 'extraction begins');
  await click('Cancel'); await pointer(attach); await pause(2000);
  assert.ok(!(await text()).includes('Review extracted values'));
  assert.ok(!await js(`!!document.querySelector('.report-sheet progress')`));
  await click('Cancel');
  passed('Oversized and unsupported reports, correction provenance, deletion, draft discard and active extraction cancellation');
  for (const response of ['For 3 days', 'No history to report', 'Skip for now', 'Not sure', 'I don’t have a report']) {
    await click(response);
  }
  await click('Review my notes');
  assert.match(await text(), /Unanswered/);
  assert.match(await text(), /Patient reported/);
  await click('View source');
  assert.ok(await js(`!!document.querySelector('[role="dialog"]')`));
  assert.match(await text(), /I have had a headache/);
  await js(`document.querySelector('button[aria-label="Close dialog"]').click()`);
  await js(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Answer in chat').click()`);
  await click('Yes, I take some');
  assert.match(await text(), /Which ones/);
  await js(`(()=>{const e=document.querySelector('input[aria-label="Your answer"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Synthetic medicine A');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await js(`document.querySelector('button[aria-label="Send answer"]').click()`);
  await until(async () => (await text()).includes('Your consultation notes'), 'details summary');
  assert.match(await text(), /Synthetic medicine A/);
  const medsSource = await js(`Array.from(document.querySelectorAll('button')).filter(e=>e.textContent.includes('View source'))[3]?.outerHTML`);
  assert.ok(medsSource);
  await js(`Array.from(document.querySelectorAll('button')).filter(e=>e.textContent.includes('View source'))[3].click()`);
  assert.match(await text(), /Yes, I take some/);
  await js(`document.querySelector('button[aria-label="Close dialog"]').click()`);
  await js(`Array.from(document.querySelectorAll('button')).filter(e=>e.textContent.trim()==='Correct answer')[3].click()`);
  await click('No, I take none');
  assert.match(await text(), /No regular medicines \(patient said none\)/);
  assert.match(await text(), /Patient unsure/);
  passed('Distinct yes/details, explicit no, unsure and skipped outcomes retain original sources');

  // Minimal genuine PDF with a text layer, generated for the isolated test only.
  const stream = 'BT /F1 18 Tf 40 220 Td (Haemoglobin: 13.2 g/dL) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref = Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await pointer(`document.querySelector('[aria-label="Open profile menu"]')`); await click('Add report');
  await js(`(()=>{const bytes=Uint8Array.from(atob('${Buffer.from(pdf).toString('base64')}'),c=>c.charCodeAt(0));const d=new DataTransfer();d.items.add(new File([bytes],'test.pdf',{type:'application/pdf'}));const e=document.querySelector('input[aria-label="Choose report file"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(async () => (await text()).includes('Review extracted values'), 'PDF text extraction', 30000);
  assert.equal(await js(`document.querySelector('input[aria-label="Observation value"]').value`), '13.2');
  await click('View source line 1');
  assert.ok(await js(`!!document.querySelector('[aria-label="Highlighted source region"]')`));
  await click('Save reviewed report');
  passed('PDF text layer preserves actual page coordinates without OCR');
  await click('Explore care');
  await screenshot('preview-directory-desktop');
  await pointer(`document.querySelector('.directory-doctor')`); await click('10:00 AM');
  await screenshot('preview-assistant-booking-desktop');
  await click('Book Appointment');
  assert.match(await text(), /no real slot is held/);
  await click('Not now');
  assert.ok(!(await text()).includes('DEMO-001'));
  await click('Book Appointment'); await click('Confirm preview appointment');
  assert.match(await text(), /No database booking/);
  await click('Open doctor preview');
  await fill('preview-question-doctor', 'Any blood thinners?');
  await click('Send question');
  async function previewRole(role) { await js(`document.querySelector('[aria-label="Open profile menu"]').click()`); await pointer(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(e=>e.textContent.trim()===${JSON.stringify(role)})`); }
  await previewRole('Patient');
  await fill('preview-answer-doctor', 'None reported');
  await until(() => js(`!document.querySelector('button[aria-label="Send clarification answer"]').disabled`), 'preview answer ready');
  await js(`document.querySelector('button[aria-label="Send clarification answer"]').click()`);
  await previewRole('Doctor'); assert.match(await text(), /Original patient answer: None reported/);
  await screenshot('preview-doctor-desktop');
  await previewRole('Patient');
  await click('Demo tools');
  await js(`(()=>{const e=document.getElementById('preview-scenario');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'emergency');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(async () => (await text()).includes('Seek emergency'), 'red emergency screen');
  assert.equal(await js(`document.querySelectorAll('nav,[role="dialog"]').length`), 0);
  assert.ok(await js(`document.querySelector('.sehat-preview').className.includes('!bg-red-700')`));
  await click('Reset synthetic scenario');
  assert.ok(await js(`!!document.querySelector('.assistant-welcome')`));
  await pointer(`document.getElementById('patient-tab')`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'));
  await js('window.scrollTo(0,0)'); await screenshot('preview-home-mobile');
  await click('Appointment'); await js('window.scrollTo(0,0)'); await screenshot('preview-directory-mobile');
  assert.equal(await js(`getComputedStyle(document.querySelector('[aria-label="Search doctors"]')).backgroundColor`), 'rgba(0, 0, 0, 0)');
  await pointer(`document.querySelector('[aria-label="Filter doctors"]')`);
  await js(`(()=>{const e=document.querySelector('[aria-label="Filter by specialty"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'Oncology');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await js(`document.querySelectorAll('.directory-doctor').length`), 1);
  await js(`(()=>{const e=document.querySelector('[aria-label="Filter by specialty"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'All Specialties');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pointer(`document.querySelector('[aria-label="Filter doctors"]')`);
  await pointer(`document.querySelector('[aria-label="Search doctors"]')`);
  await cdp('Input.insertText', { text: 'Maxwell' });
  assert.equal(await js(`document.querySelectorAll('.directory-doctor').length`), 1);
  await pointer(`document.querySelector('.directory-doctor')`); await click('10:00 AM');
  await js('window.scrollTo(0,0)'); await screenshot('preview-assistant-mobile');
  assert.equal(await js(`getComputedStyle(document.querySelector('[aria-label="Your answer"]')).borderTopWidth`), '0px');
  await pointer(`document.querySelector('[aria-label="Start voice input"]')`);
  assert.match(await text(), /Browser speech may use external processing/);
  await pointer(`document.querySelector('[aria-label="Switch to text chat"]')`);
  assert.ok(!await js(`!!document.querySelector('.voice-screen')`));
  for (const width of [344,430]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await js('window.scrollTo(0,0)'); await screenshot(`preview-assistant-${width}`);
    assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'));
    await pointer(`document.getElementById('patient-tab')`);
    await js('window.scrollTo(0,0)'); await screenshot(`preview-home-${width}`);
    await click('Appointment'); await js('window.scrollTo(0,0)'); await screenshot(`preview-directory-${width}`);
    assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'));
    await pointer(`document.querySelector('.directory-doctor')`); await click('10:00 AM');
  }
  passed('Reference layouts at 344/390/430px, directory search/filter and voice-to-keyboard fallback');
  passed('Redesigned fixture chat, provenance, confirm dialog, doctor exchange, emergency and mobile layout');
  await cdp('Page.navigate', { url: base });
  await until(() => js(`!!document.querySelector('[aria-label="Your answer"]')`), 'main server assistant');
  await js(`(()=>{const original=window.fetch;window.__releaseConversation=null;window.fetch=async(...args)=>{if(String(args[0]).endsWith('/messages'))await new Promise(resolve=>window.__releaseConversation=resolve);return original(...args);};})()`);
  await pointer(`document.querySelector('[aria-label="Your answer"]')`);
  await cdp('Input.insertText', { text: 'headache' });
  await pointer(`document.querySelector('[aria-label="Send answer"]')`);
  await until(() => js(`!!window.__releaseConversation`), 'held conversation response');
  assert.ok(await js(`Array.from(document.querySelectorAll('.chat-message.patient')).some(e=>e.textContent.includes('headache'))`), 'Patient message renders before response resolves');
  assert.ok(await js(`!!document.querySelector('[aria-label="Assistant is typing"]')`));
  assert.equal(await js(`document.querySelector('[aria-label="Your answer"]').disabled`), false);
  await js(`window.__releaseConversation()`);
  await until(() => js(`!document.querySelector('[aria-label="Assistant is typing"]')`), 'typing indicator removed');
  assert.ok((await text()).includes('How long has it been going on?'));
  assert.ok((await text()).includes('Temporary relief'));
  assert.ok(!(await text()).includes('Scripted assistant'));
  assert.ok(!(await text()).includes('Village self-care'));
  await pointer(`document.querySelector('[aria-label="Your answer"]')`);
  await cdp('Input.insertText', { text: "I don't know" });
  await pointer(`document.querySelector('[aria-label="Send answer"]')`);
  await until(() => js(`!!document.querySelector('[aria-label="Assistant is typing"]')`), 'second request');
  await js(`window.__releaseConversation()`);
  await until(async () => (await text()).includes('Where does it hurt most?'), 'next question after unknown');
  await until(() => js(`!document.querySelector('[aria-label="Assistant is typing"]')`), 'quick choices ready');
  await click('Forehead');
  await until(() => js(`!!document.querySelector('[aria-label="Assistant is typing"]')`), 'quick reply typing');
  assert.ok(await js(`Array.from(document.querySelectorAll('.chat-message.patient')).some(e=>e.textContent.includes('Forehead'))`));
  await js(`window.__releaseConversation()`);
  await until(() => js(`!document.querySelector('[aria-label="Assistant is typing"]')`), 'quick reply recorded');
  await js(`window.fetch=async()=>{throw new Error('Synthetic delayed-network failure')}`);
  await pointer(`document.querySelector('[aria-label="Your answer"]')`); await cdp('Input.insertText', { text: 'comes and goes' });
  await pointer(`document.querySelector('[aria-label="Send answer"]')`);
  await until(async () => (await text()).includes('Tap to retry'), 'failed message retry action');
  assert.ok(!await js(`!!document.querySelector('[aria-label="Assistant is typing"]')`));
  assert.ok((await text()).includes('comes and goes'));
  passed('Failed optimistic message remains visible with retry and no orphan typing bubble');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'));
  await screenshot('main-temporary-relief-mobile');
  passed('Main assistant renders optimistic typed/quick messages, typing state, no age gate and integrated temporary relief');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: base + '/?live=1' });
  await click('English'); await ready();
  const id = await js(`sessionStorage.getItem('sehat-demo-encounter-id')`);
  assert.ok(id);
  await fill('intake-input', 'Dry cough for 3 days'); await click('Send'); await ready();
  assert.match(await text(), /Dry cough for 3 days/);
  assert.match(await text(), /Not yet asked|Not yet recorded/);
  await click('Check self-care eligibility');
  assert.match(await text(), /Complete the existing safety screening/);
  assert.match(await text(), /Needs clinician review/);
  assert.ok(!(await text()).includes('While you wait to see a doctor, these may help:'));
  passed('Unanswered safety screening blocks self-care; review warning remains visible');
  await click('View original message');
  assert.ok(await js(`document.activeElement.id.startsWith('msg-')&&document.activeElement.classList.contains('msg-hl')`));
  passed('Intake, missing fields and exact patient evidence focus');

  await click('Doctor'); await until(() => js(`document.querySelectorAll('.encounter-row').length>0`), 'doctor list');
  await js(`document.querySelector('.encounter-row').click()`);
  await until(() => js(`!!document.querySelector('.doctor-grid .field-row')`), 'doctor briefing');
  await click('View original message');
  assert.ok(await js(`document.activeElement.id.startsWith('doctor-msg-')&&document.activeElement.closest('details').open`));
  assert.ok(!(await text()).includes('Confirm recorded wording'));
  await fill('doctor-question', 'Any blood thinners?'); await click('Send to patient');
  await until(async () => (await text()).includes('Waiting for the patient'), 'question saved');
  await click('Patient'); await ready();
  assert.equal(await js(`sessionStorage.getItem('sehat-demo-encounter-id')`), id);
  await fill('clarification-answer', 'None reported in this synthetic scenario'); await click('Send answer to doctor'); await ready();
  await click('Doctor');
  await until(() => js(`!!document.querySelector('.encounter-row')`), 'list reload');
  await js(`document.querySelector('.encounter-row').click()`);
  await until(async () => (await text()).includes('None reported in this synthetic scenario'), 'doctor answer');
  passed('Tab persistence, read-only doctor evidence and clarification round trip');
  await click('Patient'); await ready();

  const catalog = await api('/screening/questions');
  assert.equal(catalog.questions.length, 18);
  for (const q of catalog.questions) {
    const selector = `[role="group"][aria-label=${JSON.stringify(q.text)}]`;
    await js(`Array.from(document.querySelector(${JSON.stringify(selector)}).querySelectorAll('button')).find(e=>e.textContent.trim()==='No').click()`);
    await ready();
  }
  // Legacy fixture eligibility for testing existing video bookings only; not a patient question.
  await api(`/encounters/${id}/screening`, { adult: 'yes', physicalExam: 'no' });
  await click('Refresh encounter'); await ready();
  assert.equal((await api(`/encounters/${id}`)).decision.route, 'video');
  passed('All 18 server safety questions remain visible without adult/exam controls');
  await click('Check self-care eligibility');
  await until(() => js(`!!document.getElementById('selfcare-answer')`), 'self-care age question');
  await fill('selfcare-answer', '360'); await click('Answer self-care question');
  await until(() => js(`document.getElementById('selfcare-answer')?.tagName==='SELECT'`), 'pregnancy question');
  await js(`(()=>{const e=document.getElementById('selfcare-answer');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'yes');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('Answer self-care question');
  assert.match(await text(), /Home-care guidance is not available/);
  assert.ok(!(await text()).includes('While you wait to see a doctor, these may help:'));
  passed('Patient-reported pregnancy skips self-care without inserting guidance into the conversation');

  await fill('report-text', '\nSYNTHETIC\nHaemoglobin: 13.2 g/dL\n'); await click('Extract values'); await ready();
  await click('View source line 3');
  assert.match(await js('document.activeElement.textContent'), /3.*Haemoglobin/);
  await fill('report-text', 'Not a supported observation'); await click('Extract values'); await ready();
  assert.equal((await api(`/encounters/${id}`)).encounter.documents.length, 2);
  assert.match(await text(), /No supported observations extracted/);
  passed('Multiple reports, leading blank line preservation and unsupported extraction');

  await click('Show available doctors');
  await until(() => js(`!!document.querySelector('.slot')`), 'slots');
  await js(`document.querySelector('.slot').click()`);
  await until(async () => (await text()).includes('Confirm and book'), 'proposal');
  assert.equal((await api(`/encounters/${id}`)).booking, null);
  await screenshot('desktop-review');
  await click('Confirm and book');
  await until(async () => (await text()).includes('Booking receipt'), 'booking');
  assert.ok((await api(`/encounters/${id}`)).booking);
  passed('Real slot proposal stays unbooked until explicit confirmation; receipt returned');

  await cdp('Page.reload'); await ready();
  assert.match(await text(), /Booking receipt/);
  // Both apps persist only an encounter ID (the olive app's key appears once `/` was visited).
  const stored = await js('JSON.stringify(Object.entries(sessionStorage))');
  const entries = JSON.parse(stored);
  assert.ok(entries.some(([k]) => k === 'sehat-demo-encounter-id'));
  for (const [key, value] of entries) {
    assert.ok(['sehat-demo-encounter-id', 'sehat-olive-encounter-id'].includes(key), `unexpected storage key ${key}`);
    assert.match(value, /^[0-9a-f-]{36}$/, 'session storage holds IDs only, never medical content');
  }
  passed('Reload restoration and ID-only session storage');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(200);
  assert.ok(await js('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile page must not overflow horizontally');
  await screenshot('mobile-patient');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.notEqual(await js('document.activeElement.tagName'), 'BODY');
  passed('390px layout has no horizontal overflow; keyboard Tab reaches a control');

  await api(`/encounters/${id}/screening`, { key: catalog.questions[0].key, answer: 'yes' });
  await click('Refresh encounter');
  await until(() => js(`!!document.querySelector('.route-emergency')`), 'emergency');
  assert.match(await text(), /do not wait for this appointment/);
  assert.equal(await js(`Array.from(document.querySelectorAll('.slot,.confirm-box')).filter(${visible}).length`), 0);
  passed('Emergency takes priority over an existing booking and removes routine controls');

  await click('Evaluation');
  await until(() => js(`document.querySelectorAll('.eval-table tbody tr').length>0`), 'eval');
  const report = await api('/eval');
  assert.equal(await js(`document.querySelector('.score-big').textContent`), `${report.passed}/${report.total}`);
  passed('Scoreboard displays actual backend report');

  // Explicit test-only fetch interception; never loaded by the application or used in a demo.
  await js(`window.qaOriginalFetch = window.fetch.bind(window)`);
  async function intercept(body) { await js(`window.fetch = async (...args) => { const url=String(args[0]); ${body} return window.qaOriginalFetch(...args); }`); }
  async function restoreFetch() { await js(`window.fetch = window.qaOriginalFetch`); }
  await intercept(`if(url==='/api/eval/run') throw new Error('QA injected evaluation outage');`);
  await click('Run evaluation');
  await until(async () => (await text()).includes('QA injected evaluation outage'), 'eval error');
  assert.match(await text(), /Previous results remain/);
  await intercept(`if(url==='/api/eval/run') return new Response(JSON.stringify({generatedAt:new Date().toISOString(),ruleVersion:'QA-FIXTURE-NOT-REAL',passed:0,total:1,results:[{name:'QA injected failing case',expected:'emergency',actual:'video',passed:false}]}),{headers:{'content-type':'application/json'}});`);
  await click('Run evaluation');
  await until(async () => (await text()).includes('QA-FIXTURE-NOT-REAL'), 'failing scoreboard fixture');
  assert.equal(await js(`document.querySelector('.eval-table .fail').textContent`), 'FAIL');
  await restoreFetch(); await click('Run evaluation');
  passed('Test-only eval outage preserves old results; explicit failing fixture renders FAIL');

  await click('Patient'); await ready();
  await js(`Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('Developer / judge')).click()`);
  await until(async () => (await text()).includes('Last refreshed'), 'trace poll');
  assert.ok(await js(`document.querySelectorAll('.trace').length>0`));
  await intercept(`if(url==='/api/traces') throw new Error('QA injected trace outage');`);
  await until(async () => (await text()).includes('QA injected trace outage'), 'trace error');
  await restoreFetch(); await click('Retry');
  await until(async () => !(await text()).includes('QA injected trace outage'), 'trace recovery');
  await js(`Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('Developer / judge')).click()`);
  passed('Actual trace events poll, report network failures and recover');

  // A second real encounter supplies routine data for deliberate booking failure scenarios.
  await click('Start a new synthetic encounter'); await click('English'); await ready();
  const second = await js(`sessionStorage.getItem('sehat-demo-encounter-id')`);
  for (const q of catalog.questions) await api(`/encounters/${second}/screening`, { key: q.key, answer: 'no' });
  await api(`/encounters/${second}/screening`, { adult: 'yes', physicalExam: 'no' });
  await click('Refresh encounter'); await ready();
  await intercept(`if(url.startsWith('/api/doctors')) return new Response('[]',{headers:{'content-type':'application/json'}});`);
  await click('Show available doctors');
  await until(async () => (await text()).includes('No eligible slots returned'), 'empty slots');
  await intercept(`if(url.startsWith('/api/doctors')) throw new Error('QA injected slot outage');`);
  await click('Refresh available slots');
  await until(async () => (await text()).includes('QA injected slot outage'), 'slot error');
  await restoreFetch(); await click('Refresh available slots');
  await until(() => js(`!!document.querySelector('.slot')`), 'slots recovered');
  passed('Test-only empty-slot and error responses offer a working retry');

  // An actual competing booking takes the selected slot before our confirmation.
  await js(`document.querySelector('.slot').click()`);
  await until(async () => (await text()).includes('Confirm and book'), 'conflict proposal');
  const slots = await api('/doctors?mode=video');
  const contender = await api('/encounters', { language: 'en' });
  for (const q of catalog.questions) await api(`/encounters/${contender.encounter.id}/screening`, { key: q.key, answer: 'no' });
  await api(`/encounters/${contender.encounter.id}/screening`, { adult: 'yes', physicalExam: 'no' });
  const competing = await api(`/encounters/${contender.encounter.id}/proposals`, { slotId: slots.flatMap(d=>d.slots)[0].id });
  const consent = await api(`/proposals/${competing.proposal.id}/confirm`, { encounterId: contender.encounter.id });
  await api(`/proposals/${competing.proposal.id}/book`, { encounterId: contender.encounter.id, token: consent.token });
  await click('Confirm and book');
  await until(async () => (await text()).includes('Refresh the encounter before continuing'), 'conflict error');
  assert.equal((await api(`/encounters/${second}`)).booking, null);
  assert.ok(!(await text()).includes('Booking receipt'));
  await click('Refresh encounter'); await ready();
  passed('Real competing booking produces a conflict, not a false success receipt');

  await intercept(`if(url.endsWith('/proposals')){const r=await window.qaOriginalFetch(...args);const b=await r.json();b.proposal.expiresAt=new Date(Date.now()-1000).toISOString();return new Response(JSON.stringify(b),{headers:{'content-type':'application/json'}});}`);
  await click('Show available doctors'); await until(() => js(`!!document.querySelector('.slot')`), 'expiry slots');
  await js(`document.querySelector('.slot').click()`);
  await until(async () => (await text()).includes('Proposal expired'), 'expired proposal');
  assert.ok(await js(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Confirm and book').disabled`));
  await restoreFetch(); await click('Cancel proposal');
  passed('Test-only expired proposal disables confirmation');

  // Stale slot response must not reopen booking after an actual emergency update.
  await intercept(`if(url.startsWith('/api/doctors')){const r=await window.qaOriginalFetch(...args);await new Promise(r=>setTimeout(r,900));return r;}`);
  await click('Show available doctors');
  await api(`/encounters/${second}/screening`, { key: catalog.questions[0].key, answer: 'yes' });
  await click('Refresh encounter');
  await until(() => js(`!!document.querySelector('.route-emergency')`), 'emergency refresh');
  await pause(1000);
  assert.equal(await js(`document.querySelectorAll('.slot,.confirm-box').length`), 0);
  await restoreFetch();
  await api(`/encounters/${second}/screening`, { key: catalog.questions[0].key, answer: 'no' });
  await click('Refresh encounter'); await ready();
  passed('Delayed slot response cannot revive stale booking controls after emergency');

  await click('Show available doctors'); await until(() => js(`!!document.querySelector('.slot')`), 'lost-response slots');
  await js(`document.querySelector('.slot').click()`);
  await until(async () => (await text()).includes('Confirm and book'), 'lost-response proposal');
  await intercept(`if(url.endsWith('/book')){await window.qaOriginalFetch(...args);throw new Error('QA dropped successful booking response');}`);
  await click('Confirm and book');
  await until(async () => (await text()).includes('Booking receipt'), 'reconciled receipt');
  assert.ok((await api(`/encounters/${second}`)).booking);
  await restoreFetch();
  passed('Lost successful booking response reconciles against server without rebooking');

  await intercept(`if(url==='/api/encounters/${second}') throw new Error('QA encounter outage');`);
  await click('Refresh encounter');
  await until(async () => (await text()).includes('QA encounter outage'), 'restore failure');
  assert.equal(await js(`sessionStorage.getItem('sehat-demo-encounter-id')`), second);
  assert.ok(await js(`document.getElementById('intake-input').disabled`));
  await restoreFetch(); await click('Refresh encounter'); await ready();
  passed('Temporary encounter fetch failure preserves ID and disables editing until recovery');

  await click('Start a new synthetic encounter'); await click('অসমীয়া (Assamese)'); await ready();
  await fill('intake-input', 'মই দুৰ্বল অনুভৱ কৰিছোঁ'); await click('Send'); await ready();
  assert.match(await text(), /synthetic phrasebook, not live translation/);
  assert.match(await text(), /মই দুৰ্বল অনুভৱ কৰিছোঁ/);
  assert.equal(await js(`document.querySelectorAll('.msg.assistant')[1].getAttribute('lang')`), 'en');
  await fill('intake-input', 'এয়া পৰীক্ষাৰ বাবে অন্য বাক্য'); await click('Send'); await ready();
  assert.match(await text(), /English rendering unavailable/);
  passed('Assamese originals are preserved; exact phrasebook translations and unavailable translations are labelled honestly');
  await click('Doctor');
  await until(() => js(`document.querySelectorAll('.encounter-row').length>=2`), 'race test list');
  await intercept(`if(url.startsWith('/api/encounters/')){const r=await window.qaOriginalFetch(...args);const b=await r.clone().json();if(b.encounter?.id==='${second}') await new Promise(r=>setTimeout(r,900));return r;}`);
  const secondIndex = await js(`Array.from(document.querySelectorAll('.encounter-row')).findIndex(e=>e.textContent.includes('${second.slice(0, 8)}'))`);
  assert.ok(secondIndex >= 0);
  await js(`document.querySelectorAll('.encounter-row')[${secondIndex}].click()`);
  await pause(50);
  await js(`document.querySelectorAll('.encounter-row')[0].click()`);
  await until(async () => (await text()).includes('Patient language: Assamese'), 'new selection');
  await pause(1000);
  assert.match(await text(), /Patient language: Assamese/);
  assert.ok(!(await text()).includes('Booking receipt'));
  await restoreFetch();
  passed('Rapid doctor encounter selection ignores an older delayed briefing response');
  assert.deepEqual(errors, []);
  passed('No uncaught browser runtime exceptions during the real-data journey');
} catch (error) {
  results.push({ name: error.message, passed: false }); console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'browser-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, errors }, null, 2));
  writeFileSync(join(output, 'browser-server.log'), serverLog);
  socket?.close(); browser?.kill(); server.kill();
  await pause(1000);
  try { rmSync(temp, { recursive: true, force: true }); } catch { console.warn('Temporary profile still locked:', temp); }
}