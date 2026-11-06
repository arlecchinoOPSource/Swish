import { AppShell, Rail, BrandMark, IdentityStrip, StatusBar, IconButton, SvgIcon } from '@arlecchino/suite-ui';

/** Composition proof only. Product behavior is tracked in the numbered roadmap. */
export function App() {
  return <AppShell className="swish-shell" rail={
    <Rail label="Swish navigation" brand={<BrandMark letter="s" appName="Swish" />}
      bottom={<IconButton className="rail-bottom" icon="settings" label="Settings — planned" disabled />}>
      <IconButton icon="search" label="Search — planned" disabled />
      <button className="icon-button" type="button" aria-label="Create Project / Reminder — planned" title="Create Project / Reminder — planned" disabled>
        <SvgIcon><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-6 6v4m-6-13v3a6 6 0 0 0 6 6" /></SvgIcon>
      </button>
      <IconButton icon="themes" label="Themes — planned" disabled />
      <IconButton icon="sounds" label="Sounds — planned" disabled />
    </Rail>}>
    <IdentityStrip wordmark="Swish" />
    <main className="swish-canvas" aria-labelledby="preview-title">
      <div className="preview-notice"><h1 id="preview-title">Foundation preview</h1><p>The shared frame is connected. Reminder controls, sound, and saving are still being built.</p></div>
      <section className="project"><h2>Projects</h2><p>Organize reminders around a project and its deadline.</p><p className="empty-state">No projects in this preview.</p></section>
      <section className="project"><h2>Regular Reminders</h2><p>Keep standalone reminders here.</p><p className="empty-state">No reminders in this preview.</p></section>
    </main>
    <StatusBar tone="idle" status="PREVIEW · STORAGE NOT CONNECTED" />
  </AppShell>;
}
