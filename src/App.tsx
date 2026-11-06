import { useRef, useState } from 'react';
import { AppShell, Rail, BrandMark, IdentityStrip, StatusBar, IconButton, SvgIcon, Popover, THEMES, applyTheme, type ThemeId } from '@arlecchino/suite-ui';
type Panel = 'Search' | 'Create' | 'Themes' | 'Sounds' | 'Settings';
export function App() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [theme, setTheme] = useState<ThemeId>('blue');
  const trigger = useRef<HTMLButtonElement | null>(null);
  function open(name: Panel, button: HTMLButtonElement) { trigger.current = button; setPanel(panel === name ? null : name); }
  const action = (name: Panel, icon: 'search' | 'themes' | 'sounds' | 'settings', bottom = false) => <IconButton className={bottom ? 'rail-bottom' : ''} icon={icon} label={name} aria-expanded={panel === name} aria-controls={panel === name ? 'navigation-panel' : undefined} onClick={e => open(name, e.currentTarget)} />;
  return <AppShell toolbar={false} rail={<Rail label="Swish navigation" brand={<BrandMark letter="s" appName="Swish" />} bottom={action('Settings', 'settings', true)}>
    {action('Search', 'search')}
    <button className="icon-button" type="button" aria-label="Create Project / Reminder" title="Create Project / Reminder" aria-expanded={panel === 'Create'} onClick={e => open('Create', e.currentTarget)}><SvgIcon><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-6 6v4m-6-13v3a6 6 0 0 0 6 6" /></SvgIcon></button>
    {action('Themes', 'themes')}{action('Sounds', 'sounds')}
  </Rail>}>
    <IdentityStrip wordmark="Swish" />
    <main className="swish-canvas"><section className="project"><h1>Projects</h1><p>Your larger plans, one reminder at a time.</p><p className="empty-state">No projects yet.</p></section><section className="project"><h2>Regular Reminders</h2><p>A place for the things outside a project.</p><p className="empty-state">No reminders yet.</p></section></main>
    <StatusBar tone="idle" status="EARLY PREVIEW · NOT SAVING" />
    {panel && <Popover key={panel} id="navigation-panel" title={panel === 'Create' ? 'Create Project / Reminder' : panel} triggerRef={trigger} onClose={() => setPanel(null)}>
      <div className="panel-content">
      {panel === 'Themes' ? <fieldset><legend>Appearance</legend>{THEMES.map(t => <label className="theme-option" key={t.id}><input type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => {setTheme(t.id); applyTheme(t.id);}} />{t.label}</label>)}<p>Preview selection lasts until you close the app.</p></fieldset> : panel === 'Search' ? <><label htmlFor="search">Search reminders</label><input id="search" className="suite-input" type="search" placeholder="Project, title, or text" /><p>No reminders to search yet.</p></> : panel === 'Create' ? <><p>Projects and reminders are coming next.</p><button className="suite-button" disabled>New Project</button> <button className="suite-button" disabled>New Reminder</button></> : panel === 'Sounds' ? <p>Sound controls will appear here when the shared audio system is connected. This preview is silent.</p> : <p>Font, text size, and motion preferences will live here. This preview follows your system’s reduced-motion setting.</p>}
      </div>
    </Popover>}
  </AppShell>;
}
