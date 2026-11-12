import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppShell, Rail, BrandMark, IdentityStrip, StatusBar, IconButton, SvgIcon, Popover, type StatusTone,
  applyTheme, applyMotion, effectiveMotion, bindSoundLifecycle, ThemeControls, SoundControls, MotionControls,
  Segmented, SettingsRow, SettingsSection, StartupScreen, type Cue, type CueLabel, type Readiness,
} from '@arlecchino/suite-ui';
import { loadPreferences, KEY, TEXT_SIZES, type Preferences } from './preferences';
import { Canvas, type Editing } from './Canvas';
import { ConfirmDialog } from './ConfirmDialog';
import type { Counts, InspectResult } from './backup';
import { formatDate, toStorageError, type ProjectInput, type Reminder, type ReminderInput, type StorageError } from './domain';
import { createStorage } from './storage';
import { SearchPanel } from './SearchPanel';
import type { SearchResult } from './search';
import { sounds } from './sounds';
import { useNativeClose } from './closing';
import { removeProject, removeReminder, upsertProject, upsertReminder, useWorkspace, type SaveState } from './useWorkspace';

const storage = createStorage();
type Panel = 'Search' | 'Create' | 'Themes' | 'Sounds' | 'Settings';

/** Swish's wording for the shared cues. */
const CUE_TEXT: Partial<Record<Cue, CueLabel>> = {
  interface: { label: 'Interface', description: 'Rail buttons, panels and actions' },
  completion: { label: 'Completion', description: 'When a reminder is checked off' },
  error: { label: 'Error', description: 'When saving fails' },
  close: { label: 'Close', description: 'When Swish closes' },
  startup: { label: 'Startup', description: 'Once when Swish starts' },
};

// Decided once per launch, before the first render (like Terminal).
const launchPrefs = loadPreferences();
const showStartup = launchPrefs.startup;
const animatedStartup = effectiveMotion(launchPrefs.motion, typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) === 'full';

export function App() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [prefs, setPrefs] = useState(launchPrefs);
  const [preferenceError, setPreferenceError] = useState(false);
  const [starting, setStarting] = useState(showStartup);
  const done = useCallback(() => setStarting(false), []);
  const data = useWorkspace(storage);
  const [editing, setEditing] = useState<Editing>(null);
  const readiness: Readiness = data.state.status === 'loading' ? 'starting' : data.state.status === 'ready' ? 'ready' : 'error';
  useNativeClose(data.flush);

  async function saveProject(id: string | null, input: ProjectInput) {
    // An edit carries the version it started from; if another Swish (or the Unhollowed host) changed the project since, nothing is overwritten.
    const known = data.state.status === 'ready' && id ? data.state.workspace.projects.find(p => p.id === id)?.updatedAt : undefined;
    const result = await data.write(() => id ? storage.updateProject(id, input, known) : storage.createProject(input), upsertProject);
    if (result.error?.code === 'changed') void data.refresh();
    return { error: result.error, id: result.value?.id };
  }
  async function saveReminder(id: string | null, input: ReminderInput) {
    const known = data.state.status === 'ready' && id ? data.state.workspace.reminders.find(r => r.id === id)?.updatedAt : undefined;
    const result = await data.write(() => id ? storage.updateReminder(id, input, known) : storage.createReminder(input), upsertReminder);
    if (result.error?.code === 'changed') void data.refresh();
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
  // A failed save is heard as well as shown.
  useEffect(() => { if (data.save.status === 'error') sounds.play('error'); }, [data.save]);

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
    } catch (e) { setBackupNote({ tone: 'error', text: `Backup not saved: ${toStorageError(e).message}` }); sounds.play('error'); }
    setBackupBusy(false);
  }
  async function chooseBackup() {
    setBackupBusy(true); setBackupNote(null);
    try {
      const result = await storage.inspectBackup();
      if (result.status === 'ready') { setPanel(null); setRestoreOffer(result); }
    } catch (e) { setBackupNote({ tone: 'error', text: toStorageError(e).message }); sounds.play('error'); }
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
    } catch (e) { sounds.play('error'); return toStorageError(e); }
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

  // Applied synchronously, so a click that turns sound on is already heard.
  const latest = useRef(prefs);
  function update(next: Preferences) {
    latest.current = next;
    setPrefs(next); sounds.configure(next.audio);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setPreferenceError(false); } catch { setPreferenceError(true); }
  }
  const change = (patch: Partial<Preferences>) => update({ ...latest.current, ...patch });
  useEffect(() => { applyTheme(prefs.theme); document.documentElement.style.setProperty('--canvas-font', prefs.font === 'mono' ? 'var(--font-ui)' : 'system-ui'); document.documentElement.style.setProperty('--canvas-size', `${prefs.size}px`); }, [prefs.theme, prefs.font, prefs.size]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => applyMotion(effectiveMotion(prefs.motion, media.matches));
    sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync);
  }, [prefs.motion]);
  useEffect(() => bindSoundLifecycle(sounds), []);
  // Interface clicks: rail, panels, dialogs, and canvas actions. Previews and the
  // completion control play their own sounds.
  useEffect(() => {
    function click(event: MouseEvent) {
      const control = event.target instanceof Element ? event.target.closest('button:not(:disabled), [role="option"]') : null;
      if (!control || control.closest('.sound-preview, .suite-completion, .rail')) return;
      if (control.closest('.popover, dialog, .swish-canvas')) sounds.play('interface');
    }
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, []);

  const trigger = useRef<HTMLButtonElement | null>(null);
  function open(name: Panel, button: HTMLButtonElement) { sounds.play('interface'); trigger.current = button; setPanel(panel === name ? null : name); }
  const close = useCallback(() => setPanel(null), []);
  const action = (name: Panel, icon: 'search' | 'themes' | 'sounds' | 'settings', bottom = false) => <IconButton className={bottom ? 'rail-bottom' : ''} icon={icon} label={name} aria-expanded={panel === name} aria-controls={panel === name ? 'navigation-panel' : undefined} onClick={e => open(name, e.currentTarget)} />;
  const motionNote = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'Your system asks for reduced motion, so interface animations stay off.'
    : 'Reduced keeps colour fades only. Your reminders are never animated while you type.';

  return <><AppShell toolbar={false} rail={<Rail label="Swish navigation" brand={<BrandMark letter="s" appName="Swish" />} bottom={action('Settings', 'settings', true)}>
    {action('Search', 'search')}
    <button className="icon-button" type="button" aria-label="Create Project / Reminder" title="Create Project / Reminder" aria-expanded={panel === 'Create'} aria-controls={panel === 'Create' ? 'navigation-panel' : undefined} onClick={e => open('Create', e.currentTarget)}><SvgIcon><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-6 6v4m-6-13v3a6 6 0 0 0 6 6" /></SvgIcon></button>
    {action('Themes', 'themes')}{action('Sounds', 'sounds')}
  </Rail>}>
    <IdentityStrip wordmark="Swish" powerOn={!starting} />
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

    {panel === 'Search' && <Popover key="search" id="navigation-panel" placement="search" title="Search" closeLabel="Close search" triggerRef={trigger} onClose={close}>
      <SearchPanel workspace={data.state.status === 'ready' ? data.state.workspace : null} query={query} onQuery={setQuery} onOpen={openResult} onClose={close} />
    </Popover>}
    {panel === 'Create' && <Popover key="create" id="navigation-panel" placement="list" title="Create Project / Reminder" closeLabel="Close create" triggerRef={trigger} onClose={close}>
      <ul className="archive-list create-list" aria-label="Create">
        <li><button type="button" className="archive-row" onClick={() => startCreate({ kind: 'new-project' })}>
          <span className="archive-marker" aria-hidden="true">+</span>
          <span className="theme-name"><span className="archive-title">New Project</span><span className="archive-meta">A larger plan with its own deadline</span></span>
        </button></li>
        <li><button type="button" className="archive-row" onClick={() => startCreate({ kind: 'new-reminder', projectId: null })}>
          <span className="archive-marker" aria-hidden="true">+</span>
          <span className="theme-name"><span className="archive-title">New Reminder</span><span className="archive-meta">Standalone, or choose a project in the form</span></span>
        </button></li>
      </ul>
    </Popover>}
    {panel === 'Themes' && <Popover key="themes" id="navigation-panel" placement="search" className="theme-popover" title="Themes" closeLabel="Close themes" triggerRef={trigger} onClose={close}>
      <ThemeControls value={prefs.theme} onChange={theme => change({ theme })} />
    </Popover>}
    {panel === 'Sounds' && <Popover key="sounds" id="navigation-panel" placement="list" className="sound-popover" title="Sounds" closeLabel="Close sounds" triggerRef={trigger} onClose={close}>
      <SoundControls value={prefs.audio} onChange={audio => change({ audio })} onPreview={cue => sounds.preview(cue)} labels={CUE_TEXT} />
    </Popover>}
    {panel === 'Settings' && <Popover key="settings" id="navigation-panel" className="settings-popover" title="Settings" closeLabel="Close settings" triggerRef={trigger} onClose={close}>
      <div className="settings">
        <SettingsSection>DISPLAY</SettingsSection>
        <SettingsRow label="Font" htmlFor="settings-font">
          <select id="settings-font" value={prefs.font} onChange={e => change({ font: e.target.value as Preferences['font'] })}><option value="mono">IBM Plex Mono (default)</option><option value="system">System</option></select>
        </SettingsRow>
        <SettingsRow label="Text size" htmlFor="settings-size">
          <select id="settings-size" value={prefs.size} onChange={e => change({ size: Number(e.target.value) })}>{TEXT_SIZES.map(n => <option key={n} value={n}>{n} px{n === 16 ? ' (default)' : ''}</option>)}</select>
        </SettingsRow>
        <SettingsSection>INTERFACE</SettingsSection>
        <MotionControls value={prefs.motion} onChange={motion => change({ motion })} />
        <p className="settings-status">{motionNote}</p>
        <Segmented legend="Startup screen" options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] as const} value={prefs.startup ? 'on' : 'off'} defaultValue="on" onChange={v => change({ startup: v === 'on' })} />
        <p className="settings-status">{prefs.startup ? 'Shown while Swish opens; any key or click skips it. Applies from the next launch.' : 'Swish opens straight to your projects from the next launch.'} The startup sound is in Sounds.</p>
        <SettingsSection>BACKUP</SettingsSection>
        <p className="settings-status">A backup is a file you save where you choose. Nothing is uploaded.</p>
        <div className="settings-actions">
          <button type="button" className="suite-button" disabled={backupBusy || data.state.status !== 'ready'} onClick={exportBackup}>Export backup…</button>
          <button type="button" className="suite-button" disabled={backupBusy || data.state.status !== 'ready'} onClick={chooseBackup}>Restore from backup…</button>
        </div>
        <p role="status" className={backupNote?.tone === 'error' ? 'settings-status settings-error' : 'settings-status'}>{backupNote?.text ?? ''}</p>
        <SettingsSection>ABOUT</SettingsSection>
        <p className={preferenceError ? 'settings-status settings-error' : 'settings-status'} role={preferenceError ? 'alert' : undefined}>{preferenceError ? 'Preferences could not be saved on this device.' : 'Changes apply immediately and are saved on this device.'}</p>
        {preferenceError && <div className="settings-actions"><button type="button" className="suite-button" onClick={() => update(latest.current)}>Retry saving preferences</button></div>}
        <p className="settings-status">Due dates and deadlines are shown inside Swish only. Swish does not send background alerts or notifications. Startup, close and error sounds by Arlecchino.</p>
      </div>
    </Popover>}
  </AppShell>
  {restoreOffer && <ConfirmDialog title="Replace all data with this backup?" confirmLabel="Replace with backup" busyLabel="Restoring…"
    onCancel={() => { setRestoreOffer(null); void storage.cancelRestore(); }}
    onConfirm={() => confirmRestore(restoreOffer)}>
    <p>Backup <strong>{restoreOffer.fileName}</strong>, exported {formatDate(restoreOffer.exportedAt.slice(0, 10))}: {describe(restoreOffer.backup)}.</p>
    <p>Your current {describe(restoreOffer.current)} will be replaced. A safety copy of them is saved first, and you can undo right after restoring.</p>
  </ConfirmDialog>}
  {starting && <StartupScreen minimumDurationMs={2200} readiness={readiness} animated={animatedStartup} onDone={done} appName="Swish" wordmark="Swish" messages={{ opening: 'OPENING SWISH', slow: 'STILL OPENING YOUR PROJECTS', error: 'LOCAL DATA UNAVAILABLE' }} />}</>;
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
