import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Rail, BrandMark, IdentityStrip, StatusBar, IconButton, SvgIcon, Popover, type StatusTone, applyTheme, applyMotion, effectiveMotion, createSoundManager, bindSoundLifecycle, ThemeControls, SoundControls, MotionControls, StartupScreen } from '@arlecchino/suite-ui';
import { loadPreferences, KEY, type Preferences } from './preferences';
import { Canvas, type Editing } from './Canvas';
import { ConfirmDialog } from './ConfirmDialog';
import type { Counts, InspectResult } from './backup';
import { formatDate, toStorageError, type ProjectInput, type Reminder, type ReminderInput, type StorageError } from './domain';
import { createStorage } from './storage';
import { SearchPanel } from './SearchPanel';
import type { SearchResult } from './search';
import { removeProject, removeReminder, upsertProject, upsertReminder, useWorkspace, type SaveState } from './useWorkspace';
const sounds = createSoundManager();
const storage = createStorage();
type Panel = 'Search' | 'Create' | 'Themes' | 'Sounds' | 'Settings';
export function App() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [prefs, setPrefs] = useState(loadPreferences);
  const [preferenceError, setPreferenceError] = useState(false);
  const [starting, setStarting] = useState(prefs.startup);
  const done = useCallback(() => setStarting(false), []);
  const data = useWorkspace(storage);
  const [editing, setEditing] = useState<Editing>(null);
  async function saveProject(id: string | null, input: ProjectInput) {
    const result = await data.write(() => id ? storage.updateProject(id, input) : storage.createProject(input), upsertProject);
    return { error: result.error, id: result.value?.id };
  }
  async function saveReminder(id: string | null, input: ReminderInput) {
    const result = await data.write(() => id ? storage.updateReminder(id, input) : storage.createReminder(input), upsertReminder);
    return { error: result.error, id: result.value?.id };
  }
  async function setCompleted(id: string, completed: boolean) {
    const { error } = await data.write(() => storage.setReminderCompleted(id, completed), upsertReminder);
    // Feedback follows the stored result, not the click.
    if (!error && completed) sounds.play('completion');
    return error;
  }
  async function deleteProject(id: string, expectedReminders: number) {
    return (await data.write(() => storage.deleteProject(id, expectedReminders), (workspace, deleted) => removeProject(workspace, deleted.projectId))).error;
  }
  async function deleteReminder(id: string) {
    const result = await data.write(() => storage.deleteReminder(id), (workspace, reminder) => removeReminder(workspace, reminder.id));
    return { error: result.error, removed: result.value };
  }
  async function restoreReminder(reminder: Reminder) {
    return (await data.write(() => storage.restoreReminder(reminder), upsertReminder)).error;
  }
  const [query, setQuery] = useState('');
  /** Closes Search and brings the matching item into view with keyboard focus. */
  function openResult(result: SearchResult) {
    setPanel(null);
    const target = result.kind === 'project' ? `project-${result.project.id}` : `reminder-${result.reminder.id}`;
    requestAnimationFrame(() => {
      const element = document.getElementById(target);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth' });
      element.focus({ preventScroll: true });
      const card = element.closest('.project, .reminder');
      card?.setAttribute('data-search-hit', '');
      setTimeout(() => card?.removeAttribute('data-search-hit'), 2400);
    });
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const describe = (c: Counts) => `${plural(c.projects, 'project')} and ${plural(c.reminders, 'reminder')}`;
  const [backupNote, setBackupNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<Extract<InspectResult, { status: 'ready' }> | null>(null);
  const [restored, setRestored] = useState<{ text: string; error: StorageError | null; busy: boolean } | null>(null);
  async function exportBackup() {
    setBackupBusy(true); setBackupNote(null);
    try {
      const result = await storage.exportBackup();
      if (result.status === 'saved') setBackupNote({ tone: 'ok', text: `Backup saved as ${result.fileName} (${describe(result.counts)}).` });
    } catch (e) { setBackupNote({ tone: 'error', text: `Backup not saved: ${toStorageError(e).message}` }); }
    setBackupBusy(false);
  }
  async function chooseBackup() {
    setBackupBusy(true); setBackupNote(null);
    try {
      const result = await storage.inspectBackup();
      if (result.status === 'ready') { setPanel(null); setRestoreOffer(result); }
    } catch (e) { setBackupNote({ tone: 'error', text: toStorageError(e).message }); }
    setBackupBusy(false);
  }
  async function confirmRestore(offer: Extract<InspectResult, { status: 'ready' }>): Promise<StorageError | null> {
    try {
      const result = await storage.restoreBackup(offer.token);
      setRestoreOffer(null);
      setEditing(null);
      await data.reload();
      setRestored({ text: `Restored ${describe(result.restored)} from ${offer.fileName}. Your previous data was saved first (${result.safetyCopy}).`, error: null, busy: false });
      return null;
    } catch (e) { return toStorageError(e); }
  }
  async function undoRestore() {
    setRestored(r => r && { ...r, busy: true, error: null });
    try {
      const counts = await storage.undoRestore();
      await data.reload();
      setRestored(null);
      setBackupNote({ tone: 'ok', text: `Restore undone: your previous ${describe(counts)} are back.` });
    } catch (e) { setRestored(r => r && { ...r, busy: false, error: toStorageError(e) }); }
  }
  function startCreate(next: Editing) { setPanel(null); setEditing(next); }
  function update(next: Preferences) {
    setPrefs(next); sounds.configure(next.audio);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setPreferenceError(false); } catch { setPreferenceError(true); }
  }
  useEffect(() => { applyTheme(prefs.theme); document.documentElement.style.setProperty('--canvas-font', prefs.font === 'mono' ? 'var(--font-ui)' : 'system-ui'); document.documentElement.style.setProperty('--canvas-size', `${prefs.size}px`); }, [prefs.theme,prefs.font,prefs.size]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => applyMotion(effectiveMotion(prefs.motion, media.matches));
    sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync);
  }, [prefs.motion]);
  useEffect(() => { sounds.configure(prefs.audio); if(prefs.startup) sounds.play('startup'); return bindSoundLifecycle(sounds); }, []);

  const trigger = useRef<HTMLButtonElement | null>(null);
  function open(name: Panel, button: HTMLButtonElement) { sounds.play('interface'); trigger.current = button; setPanel(panel === name ? null : name); }
  const action = (name: Panel, icon: 'search' | 'themes' | 'sounds' | 'settings', bottom = false) => <IconButton className={bottom ? 'rail-bottom' : ''} icon={icon} label={name} aria-expanded={panel === name} aria-controls={panel === name ? 'navigation-panel' : undefined} onClick={e => open(name, e.currentTarget)} />;
  return <><AppShell toolbar={false} rail={<Rail label="Swish navigation" brand={<BrandMark letter="s" appName="Swish" />} bottom={action('Settings', 'settings', true)}>
    {action('Search', 'search')}
    <button className="icon-button" type="button" aria-label="Create Project / Reminder" title="Create Project / Reminder" aria-expanded={panel === 'Create'} onClick={e => open('Create', e.currentTarget)}><SvgIcon><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-6 6v4m-6-13v3a6 6 0 0 0 6 6" /></SvgIcon></button>
    {action('Themes', 'themes')}{action('Sounds', 'sounds')}
  </Rail>}>
    <IdentityStrip wordmark="Swish" />
    <Canvas data={data.state} onRetry={data.reload} editing={editing} onEdit={setEditing} saveProject={saveProject} saveReminder={saveReminder} setCompleted={setCompleted} deleteProject={deleteProject} deleteReminder={deleteReminder} restoreReminder={restoreReminder}
      banner={restored && <section className="project restore-notice" role="status" aria-label="Restore complete">
        <p>✓ {restored.text}</p>
        {restored.error && <p className="form-error" role="alert">{restored.error.message}</p>}
        <div className="form-actions">
          <button type="button" className="suite-button" disabled={restored.busy} onClick={undoRestore}>{restored.busy ? 'Undoing…' : 'Undo restore'}</button>
          <button type="button" className="suite-button" disabled={restored.busy} onClick={() => setRestored(null)}>Dismiss</button>
        </div>
      </section>} />
    <StatusBar {...statusFor(preferenceError, data.state.status, data.save)} />
    {panel && <Popover key={panel} id="navigation-panel" title={panel === 'Create' ? 'Create Project / Reminder' : panel} triggerRef={trigger} onClose={() => setPanel(null)}>
      <div className="panel-content">
      {panel === 'Themes' ? <ThemeControls value={prefs.theme} onChange={theme => update({...prefs,theme})} /> : panel === 'Search' ? <SearchPanel workspace={data.state.status === 'ready' ? data.state.workspace : null} query={query} onQuery={setQuery} onOpen={openResult} /> : panel === 'Create' ? <><button className="suite-button primary" onClick={() => startCreate({ kind: 'new-project' })}>New Project</button> <button className="suite-button primary" onClick={() => startCreate({ kind: 'new-reminder', projectId: null })}>New Reminder</button><p>Choose a project inside the reminder form, or keep it as a regular reminder.</p></> : panel === 'Sounds' ? <SoundControls value={prefs.audio} onChange={audio => update({...prefs,audio})} onPreview={cue => sounds.play(cue,true)} /> : <>
      <label className="suite-option">Font<select aria-label="Font" value={prefs.font} onChange={e => update({...prefs,font:e.target.value as Preferences['font']})}><option value="mono">IBM Plex Mono</option><option value="system">System</option></select></label>
      <label className="suite-option">Text size<select aria-label="Text size" value={prefs.size} onChange={e => update({...prefs,size:Number(e.target.value)})}>{[14,16,18,20,24].map(n=><option key={n} value={n}>{n}px</option>)}</select></label>
      <MotionControls value={prefs.motion} onChange={motion => update({...prefs,motion})} />
      <label className="suite-option"><input type="checkbox" checked={prefs.startup} onChange={e => update({...prefs,startup:e.target.checked})} />Startup screen</label>
      <p>Your system’s reduced-motion preference takes priority. Settings stay on this device.</p>
      <p>Due dates and deadlines are shown inside Swish only. Swish does not send background alerts or notifications.</p>
      <fieldset className="backup-controls"><legend>Backup</legend>
        <p>A backup is a file you save where you choose. Nothing is uploaded.</p>
        <div className="form-actions">
          <button type="button" className="suite-button" disabled={backupBusy || data.state.status !== 'ready'} onClick={exportBackup}>Export backup…</button>
          <button type="button" className="suite-button" disabled={backupBusy || data.state.status !== 'ready'} onClick={chooseBackup}>Restore from backup…</button>
        </div>
        <p role="status" className={backupNote?.tone === 'error' ? 'form-error' : 'search-summary'}>{backupNote?.text ?? ''}</p>
      </fieldset>
      {preferenceError && <button className="suite-button" onClick={() => update(prefs)}>Retry saving preferences</button>}
      </>}
      </div>
    </Popover>}
  </AppShell>
  {restoreOffer && <ConfirmDialog title="Replace all data with this backup?" confirmLabel="Replace with backup" busyLabel="Restoring…"
    onCancel={() => { setRestoreOffer(null); void storage.cancelRestore(); }}
    onConfirm={() => confirmRestore(restoreOffer)}>
    <p>Backup <strong>{restoreOffer.fileName}</strong>, exported {formatDate(restoreOffer.exportedAt.slice(0, 10))}: {describe(restoreOffer.backup)}.</p>
    <p>Your current {describe(restoreOffer.current)} will be replaced. A safety copy of them is saved first, and you can undo right after restoring.</p>
  </ConfirmDialog>}
  {starting && <StartupScreen readiness="ready" animated={prefs.motion === 'full' && !matchMedia('(prefers-reduced-motion: reduce)').matches} onDone={done} appName="Swish" wordmark="Swish" messages={{opening:'OPENING SWISH',slow:'STILL OPENING',error:'STARTUP UNAVAILABLE'}} />}</>;
}

/** The status bar states only what actually happened. "Saved" requires a confirmed native commit. */
function statusFor(preferenceError: boolean, load: 'loading' | 'ready' | 'error', save: SaveState): { tone: StatusTone; status: string } {
  if (preferenceError) return { tone: 'error', status: 'PREFERENCES NOT SAVED — TRY AGAIN IN SETTINGS' };
  if (load === 'error') return { tone: 'error', status: 'LOCAL DATA UNAVAILABLE' };
  if (load === 'loading') return { tone: 'busy', status: 'OPENING LOCAL DATA' };
  if (save.status === 'saving') return { tone: 'busy', status: 'SAVING…' };
  if (save.status === 'error') return { tone: 'error', status: save.error.code === 'invalid' ? 'NOT SAVED — CHECK THE HIGHLIGHTED FIELD' : 'NOT SAVED — YOUR CHANGES ARE KEPT FOR RETRY' };
  if (storage.kind === 'preview') return { tone: 'idle', status: 'BROWSER PREVIEW · NOT SAVING TO DISK' };
  if (save.status === 'saved') return { tone: 'ok', status: 'SAVED' };
  return { tone: 'idle', status: 'LOCAL DATA READY' };
}
