import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Rail, BrandMark, IdentityStrip, StatusBar, IconButton, SvgIcon, Popover, type StatusTone, applyTheme, applyMotion, effectiveMotion, createSoundManager, bindSoundLifecycle, ThemeControls, SoundControls, MotionControls, StartupScreen } from '@arlecchino/suite-ui';
import { loadPreferences, KEY, type Preferences } from './preferences';
import { Canvas, type Editing } from './Canvas';
import type { ProjectInput } from './domain';
import { createStorage } from './storage';
import { upsertProject, useWorkspace, type SaveState } from './useWorkspace';
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
    let savedId: string | undefined;
    const error = await data.write(() => id ? storage.updateProject(id, input) : storage.createProject(input), (workspace, project) => { savedId = project.id; return upsertProject(workspace, project); });
    return { error, id: savedId };
  }
  function startCreate(kind: 'new-project') { setPanel(null); setEditing({ kind }); }
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
    <Canvas data={data.state} onRetry={data.reload} editing={editing} onEdit={setEditing} saveProject={saveProject} />
    <StatusBar {...statusFor(preferenceError, data.state.status, data.save)} />
    {panel && <Popover key={panel} id="navigation-panel" title={panel === 'Create' ? 'Create Project / Reminder' : panel} triggerRef={trigger} onClose={() => setPanel(null)}>
      <div className="panel-content">
      {panel === 'Themes' ? <ThemeControls value={prefs.theme} onChange={theme => update({...prefs,theme})} /> : panel === 'Search' ? <><label htmlFor="search">Search reminders</label><input id="search" className="suite-input" type="search" placeholder="Project, title, or text" /><p>No saved reminders to search yet.</p></> : panel === 'Create' ? <><button className="suite-button primary" onClick={() => startCreate('new-project')}>New Project</button> <button className="suite-button" disabled title="Reminder creation arrives in the next update">New Reminder</button></> : panel === 'Sounds' ? <SoundControls value={prefs.audio} onChange={audio => update({...prefs,audio})} onPreview={cue => sounds.play(cue,true)} /> : <>
      <label className="suite-option">Font<select aria-label="Font" value={prefs.font} onChange={e => update({...prefs,font:e.target.value as Preferences['font']})}><option value="mono">IBM Plex Mono</option><option value="system">System</option></select></label>
      <label className="suite-option">Text size<select aria-label="Text size" value={prefs.size} onChange={e => update({...prefs,size:Number(e.target.value)})}>{[14,16,18,20,24].map(n=><option key={n} value={n}>{n}px</option>)}</select></label>
      <MotionControls value={prefs.motion} onChange={motion => update({...prefs,motion})} />
      <label className="suite-option"><input type="checkbox" checked={prefs.startup} onChange={e => update({...prefs,startup:e.target.checked})} />Startup screen</label>
      <p>Your system’s reduced-motion preference takes priority. Settings stay on this device.</p>
      {preferenceError && <button className="suite-button" onClick={() => update(prefs)}>Retry saving preferences</button>}
      </>}
      </div>
    </Popover>}
  </AppShell>{starting && <StartupScreen readiness="ready" animated={prefs.motion === 'full' && !matchMedia('(prefers-reduced-motion: reduce)').matches} onDone={done} appName="Swish" wordmark="Swish" messages={{opening:'OPENING SWISH',slow:'STILL OPENING',error:'STARTUP UNAVAILABLE'}} />}</>;
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
