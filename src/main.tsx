import { createRoot } from 'react-dom/client';
import '@arlecchino/suite-ui/index.css';
import './style.css';
import { App } from './App';
import { loadPreferences } from './preferences';
import { sounds } from './sounds';

// Before the first render, like Terminal: settings only, then the startup sound once
// per launch (skipped when sound is off or the system will not let audio start yet).
sounds.configure(loadPreferences().audio);
void sounds.playStartup();
createRoot(document.getElementById('root')!).render(<App />);
