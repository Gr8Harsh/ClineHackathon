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
delete env.ANTHROPIC_API_KEY; delete env.SEHAT_TEST;
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
  async function click(text) {
    await until(() => js(`Array.from(document.querySelectorAll('button')).filter(${visible}).some(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`), `button ${text}`);
    await js(`Array.from(document.querySelectorAll('button')).filter(${visible}).find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled).click()`);
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
  await cdp('Page.navigate', { url: base });
  await click('English'); await ready();
  const id = await js(`sessionStorage.getItem('sehat-demo-encounter-id')`);
  assert.ok(id);
  await fill('intake-input', 'Dry cough for 3 days'); await click('Send'); await ready();
  assert.match(await text(), /Dry cough for 3 days/);
  assert.match(await text(), /Not yet recorded/);
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
  for (const [label, answer] of [['Is the patient an adult?', 'Yes'], ['Might a doctor need to examine you in person?', 'No']]) {
    await js(`Array.from(document.querySelector(${JSON.stringify(`[role="group"][aria-label=${JSON.stringify(label)}]`)}).querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(answer)}).click()`);
    await ready();
  }
  assert.equal((await api(`/encounters/${id}`)).decision.route, 'video');
  passed('All 18 server questions and adult/exam controls enable routine route');

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
  assert.deepEqual(await js('Object.keys(sessionStorage)'), ['sehat-demo-encounter-id']);
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
  assert.match(await text(), /English rendering unavailable/);
  await fill('intake-input', 'মই দুৰ্বল অনুভৱ কৰিছোঁ'); await click('Send'); await ready();
  assert.equal(await js(`document.querySelectorAll('.msg.assistant')[1].getAttribute('lang')`), 'en');
  passed('Assamese original is preserved; unavailable English and English guided follow-up are labelled honestly');
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