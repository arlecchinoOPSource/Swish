// Native end-to-end regression: drives the real Swish desktop binary through
// tauri-driver (W3C WebDriver) against throwaway data folders, and checks the SQLite
// file directly. Runs on Linux (WebKitWebDriver) and Windows (msedgedriver); Apple
// provides no WebDriver for WKWebView apps, so macOS needs manual checks.
//
//   npm run build && cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol
//   npm run test:native
//
// Synthetic data only. Uses no dependencies beyond Node 22+.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const windows = process.platform === 'win32';
const app = resolve(process.env.SWISH_APP ?? join('src-tauri', 'target', 'debug', windows ? 'swish.exe' : 'swish'));
const driverBin = process.env.TAURI_DRIVER ?? 'tauri-driver';
const PORT = 4444;
const ELEMENT = 'element-6066-11e4-a932-00b137f6db8a';
const results = [];

if (!existsSync(app)) { console.error(`Swish binary not found at ${app}. Build it first (see header).`); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wd(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(json.value ?? json).slice(0, 300)}`);
  return json.value;
}

/** One app launch with its own data folder; a new launch on the same folder is a restart. */
async function launch(dataDir, { fresh = false } = {}) {
  const driver = spawn(driverBin, ['--port', String(PORT)], { env: { ...process.env, SWISH_DATA_DIR: dataDir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/status`); break; } catch { await sleep(200); } }
  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: app } } } });
  const id = session.sessionId;
  const s = {
    async run(script, ...args) { return wd('POST', `/session/${id}/execute/sync`, { script, args }); },
    /** Polls a predicate in the page until it returns a truthy value. */
    async until(script, label, timeout = 15000, ...args) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) { last = await s.run(script, ...args).catch(e => e.message); if (last && !(typeof last === 'string' && last.includes('→'))) return last; await sleep(150); }
      const page = await s.run('return document.body.innerText;').catch(() => '');
      throw new Error(`timed out waiting for: ${label} (last: ${JSON.stringify(last)})\n  page: ${String(page).replace(/\s+/g, ' ').slice(0, 700)}`);
    },
    /** Finds a button/checkbox by accessible name and clicks it with a real WebDriver click. */
    async click(name) {
      const el = await s.until(`const n = arguments[0]; return [...document.querySelectorAll('button,[role=checkbox]')].find(b => !b.disabled && ((b.getAttribute('aria-label') ?? b.textContent).trim() === n)) ?? null;`, `button "${name}"`, 15000, name);
      const ref = el[ELEMENT] ?? el.ELEMENT ?? Object.values(el)[0];
      for (let attempt = 1; ; attempt++) {
        // Center the target first; the driver hit-tests immediately after scrolling.
        await s.run('arguments[0].scrollIntoView({ block: "center" });', el);
        await sleep(100);
        try { await wd('POST', `/session/${id}/element/${ref}/click`, {}); return; }
        catch (e) { if (attempt >= 4 || !String(e.message).includes('not interactable')) throw new Error(`click "${name}": ${e.message}`); await sleep(300); }
      }
    },
    /** Types into a labelled field (React-compatible for every input type, including dates). */
    async fill(label, value) {
      await s.until(`
        const [label, value] = arguments;
        const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim().startsWith(label));
        const el = l && document.getElementById(l.htmlFor);
        if (!el) return null;
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;`, `field "${label}"`, 15000, label, value);
    },
    /** Real keyboard input through WebDriver actions. */
    async keys(...keys) {
      const codes = { Tab: '\uE004', Enter: '\uE007', Escape: '\uE00C', Space: '\uE00D' };
      const actions = keys.flatMap(k => [{ type: 'keyDown', value: codes[k] ?? k }, { type: 'keyUp', value: codes[k] ?? k }]);
      await wd('POST', `/session/${id}/actions`, { actions: [{ type: 'key', id: 'keyboard', actions }] });
      await wd('DELETE', `/session/${id}/actions`).catch(() => {});
    },
    text: () => s.run('return document.body.innerText;'),
    status: () => s.run(`return document.querySelector('.save-status')?.textContent ?? '';`),
    async close() { await wd('DELETE', `/session/${id}`).catch(() => {}); driver.kill(); await sleep(800); },
  };
  const ready = () => s.until(`return !document.querySelector('.startup') && (document.querySelector('h1')?.textContent === 'Projects' || !!document.querySelector('.storage-error'));`, 'app ready', 30000);
  await ready();
  if (fresh) {
    // The webview profile (preferences, drafts) is shared between runs; start each scenario clean.
    await s.run(`localStorage.clear(); localStorage.setItem('swish.preferences.v1', JSON.stringify({ startup: false })); location.reload();`);
    await sleep(500);
    await ready();
  }
  return s;
}

const db = dir => new DatabaseSync(join(dir, 'swish.sqlite3'));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }

async function scenario(name, body) {
  const dir = mkdtempSync(join(tmpdir(), 'swish-native-'));
  const started = Date.now();
  try { await body(dir); results.push({ name, ok: true, ms: Date.now() - started }); console.log(`✓ ${name}`); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log(`✘ ${name}\n  ${error.message}`); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

await scenario('create, edit, complete, and restart keep everything in SQLite', async dir => {
  let s = await launch(dir, { fresh: true });
  try {
    assert((await s.status()).includes('LOCAL DATA READY'), `fresh status: ${await s.status()}`);
    await s.click('New Project');
    await s.fill('Project name', 'Native project');
    await s.fill('Description', 'Created over WebDriver');
    await s.fill('Project deadline', '2026-12-31');
    await s.click('Create project');
    await s.until(`return document.body.innerText.includes('Native project');`, 'project shown');
    await s.click('New Reminder in Native project');
    await s.fill('Reminder header', 'Native reminder');
    await s.fill('Due date', '2026-12-15');
    await s.click('Create reminder');
    await s.until(`return !!document.querySelector('[aria-label="Complete Native reminder"]');`, 'reminder shown');
    await s.click('Complete Native reminder');
    await s.until(`return document.body.innerText.includes('1 of 1 completed');`, 'progress');
    await s.click('Edit reminder Native reminder');
    await s.fill('Reminder text', 'Edited natively');
    await s.click('Save reminder');
    await s.until(`return document.querySelector('.save-status')?.textContent === 'SAVED';`, 'SAVED after commit');
    assert(!(await s.text()).includes('Unsaved changes kept'), 'saved forms must not leave drafts');
  } finally { await s.close(); }

  const rows = db(dir).prepare('SELECT title, text, due_date, completed_at FROM reminders').all();
  assert(rows.length === 1 && rows[0].text === 'Edited natively' && rows[0].due_date === '2026-12-15' && rows[0].completed_at, `rows: ${JSON.stringify(rows)}`);
  const project = db(dir).prepare('SELECT deadline FROM projects').get();
  assert(project.deadline === '2026-12-31', `deadline stored as ${project.deadline}`);

  s = await launch(dir);
  try {
    const text = await s.text();
    assert(text.includes('Native project') && text.includes('Edited natively') && text.includes('1 of 1 completed'), 'state after restart');
    assert(await s.run(`return document.querySelector('[aria-label="Complete Native reminder"]').getAttribute('aria-checked');`) === 'true', 'completion after restart');
  } finally { await s.close(); }
});

await scenario('search, reminder delete + undo, and project delete persist across restart', async dir => {
  let s = await launch(dir, { fresh: true });
  try {
    for (const name of ['Keep project', 'Doomed project']) {
      await s.click('New Project');
      await s.fill('Project name', name);
      await s.fill('Project deadline', '2026-12-01');
      await s.click('Create project');
      await s.until(`return document.body.innerText.includes(arguments[0]);`, name, 15000, name);
    }
    for (const [title, project] of [['Café booking', 'Keep project'], ['Doomed child', 'Doomed project'], ['Undo me', 'Keep project']]) {
      await s.click(`New Reminder in ${project}`);
      await s.fill('Reminder header', title);
      await s.click('Create reminder');
      await s.until(`return !!document.querySelector('[aria-label="Complete ' + arguments[0] + '"]');`, title, 15000, title);
    }
    await s.click('Search');
    await s.fill('Search projects and reminders', 'CAFE');
    await s.until(`return document.querySelector('.search-results')?.innerText.includes('Café booking');`, 'accent-insensitive search');
    await s.run(`document.querySelector('.search-result').click();`);
    await s.until(`return document.activeElement?.textContent === 'Café booking';`, 'search navigation focus');

    await s.click('Delete reminder Undo me');
    await s.click('Undo delete');
    await s.until(`return !!document.querySelector('[aria-label="Complete Undo me"]');`, 'undo restored');
    await s.click('Delete reminder Undo me');
    await s.click('Dismiss');

    await s.run(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.startsWith('Delete project Doomed project')).click();`);
    // WebKitWebDriver cannot click inside a modal <dialog>; use the keyboard like a user would.
    await s.until(`return document.activeElement?.textContent === 'Cancel' && !!document.querySelector('dialog[open]');`, 'confirmation focused on Cancel');
    await s.keys('Tab', 'Enter');
    await s.until(`return !document.body.innerText.includes('Doomed child');`, 'project and child deleted');
    await s.until(`return document.querySelector('.save-status')?.textContent === 'SAVED';`, 'SAVED');
  } finally { await s.close(); }

  const titles = db(dir).prepare('SELECT title FROM reminders ORDER BY title').all().map(r => r.title);
  assert(JSON.stringify(titles) === JSON.stringify(['Café booking']), `reminders left: ${titles}`);
  assert(db(dir).prepare('SELECT count(*) AS n FROM projects').get().n === 1, 'one project left');
  s = await launch(dir);
  try {
    const text = await s.text();
    assert(text.includes('Café booking') && !text.includes('Undo me') && !text.includes('Doomed'), 'deletions after restart');
    assert(!text.includes('Unsaved changes kept'), 'saved forms must not leave drafts');
  } finally { await s.close(); }
});

await scenario('an older empty database is migrated on first launch', async dir => {
  new DatabaseSync(join(dir, 'swish.sqlite3')).close(); // schema version 0, no tables
  const s = await launch(dir, { fresh: true });
  try { assert((await s.status()).includes('LOCAL DATA READY'), await s.status()); } finally { await s.close(); }
  const d = db(dir);
  assert(d.prepare('PRAGMA user_version').get().user_version === 1, 'migrated to schema 1');
  assert(d.prepare('PRAGMA application_id').get().application_id === 0x53575348, 'marked as Swish data');
});

for (const [label, prepare, expected] of [
  ['a file from a newer Swish', dir => { const d = new DatabaseSync(join(dir, 'swish.sqlite3')); d.exec('PRAGMA application_id = 1398231880; PRAGMA user_version = 99;'); d.close(); }, 'newer version of Swish'],
  ['another application’s database', dir => { const d = new DatabaseSync(join(dir, 'swish.sqlite3')); d.exec('CREATE TABLE journal (body TEXT);'); d.close(); }, 'belongs to another application'],
  ['a corrupt file', dir => writeFileSync(join(dir, 'swish.sqlite3'), Buffer.from('this is not a database '.repeat(400))), 'could not reach its local data file'],
]) {
  await scenario(`${label} is explained and left untouched`, async dir => {
    prepare(dir);
    const before = hash(join(dir, 'swish.sqlite3'));
    const s = await launch(dir, { fresh: true });
    try {
      await s.until(`return document.querySelector('.storage-error')?.innerText.includes(arguments[0]);`, `error mentioning "${expected}"`, 15000, expected);
      assert((await s.status()).includes('LOCAL DATA UNAVAILABLE'), await s.status());
      assert(!(await s.text()).includes('No projects yet'), 'must not show invented empty data');
    } finally { await s.close(); }
    assert(hash(join(dir, 'swish.sqlite3')) === before, 'file was modified');
    assert(readdirSync(dir).every(f => !f.endsWith('-journal')), 'no leftover journal');
  });
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (${process.platform})`);
writeFileSync(process.env.SWISH_NATIVE_REPORT ?? 'native-e2e-report.json', JSON.stringify({ platform: process.platform, app, results }, null, 2));
process.exit(failed.length ? 1 : 0);
