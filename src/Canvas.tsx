import { useState } from 'react';
import { CompletionControl } from '@arlecchino/suite-ui';
import type { WorkspaceState } from './useWorkspace';
type Reminder = { id: string; title: string; text: string; due: string; done: boolean; projectId: string | null };
const sample: Reminder[] = [
 { id:'debug',title:'Debug the desktop shell',text:'Check the narrow window, focus states, and blue theme.',due:'Nov 7',done:false,projectId:'app' },
 { id:'commit',title:'Commit the reviewed changes',text:'Keep the shared framework and app changes together in the review.',due:'Nov 8',done:true,projectId:'app' },
 { id:'notes',title:'Write down the next idea',text:'A standalone reminder, outside a project.',due:'',done:false,projectId:null },
];
export function Canvas({ data, onRetry, onComplete }: { data: WorkspaceState; onRetry: () => void; onComplete: () => void }) {
 const [items,setItems] = useState<Reminder[]>([]);
 const [demo,setDemo] = useState(false);
 const card = (item: Reminder) => <article className="reminder" key={item.id}>
  <div className="reminder-body"><div><h3>{item.title}</h3>{item.due && <p className="due">Due {item.due}</p>}<p>{item.text}</p><span className="completion-label">{item.done ? 'Completed' : 'Not completed'}</span></div><CompletionControl label={`Complete ${item.title}`} checked={item.done} onChange={done => {setItems(items.map(i => i.id === item.id ? {...i,done} : i)); if(done) onComplete();}} /></div>
  <button type="button" className="suite-button destructive" disabled title="Deletion arrives with reminder storage">Delete Reminder</button>
 </article>;
 if (data.status !== 'ready') return <main className="swish-canvas" aria-busy={data.status === 'loading'}>
  {data.status === 'loading' ? <p className="project">Opening local data…</p> : <section className="project storage-error" role="alert"><h2>Local data unavailable</h2><p>{data.error.message}</p><p>Your existing data has not been changed.</p><button type="button" className="suite-button primary" onClick={onRetry}>Try again</button></section>}
 </main>;
 return <main className="swish-canvas">
 <div className="canvas-heading"><h1>Projects</h1><button type="button" className="suite-button" onClick={() => {setDemo(!demo);setItems(demo ? [] : sample);}}>{demo ? 'Hide sample layout' : 'Preview sample layout'}</button></div>
 {demo ? <><p className="sample-notice">Sample layout — changes are not saved.</p><section className="project" aria-label="App development"><header className="project-heading"><h2>App development</h2><span className="due">Due Nov 12</span></header><p>{items.filter(i=>i.projectId && i.done).length} / 2 completed</p><div className="project-reminders" tabIndex={0} aria-label="Project reminders">{items.filter(i=>i.projectId).map(card)}</div><button type="button" className="suite-button destructive" disabled>Delete Project</button></section></> : <section className="project"><p>Your larger plans, one reminder at a time.</p><p className="empty-state">No projects yet.</p></section>}
 <section className="project"><h2>Regular Reminders</h2>{demo ? items.filter(i=>!i.projectId).map(card) : <p className="empty-state">No reminders yet.</p>}</section>
 </main>;
}
