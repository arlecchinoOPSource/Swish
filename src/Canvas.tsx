import { useEffect, useState, type ReactNode } from 'react';
import { CompletionControl } from '@arlecchino/suite-ui';
import { formatDate, type Project, type ProjectInput, type Reminder, type ReminderInput, type StorageError } from './domain';
import { ProjectForm } from './ProjectForm';
import { ReminderForm } from './ReminderForm';
import type { WorkspaceState } from './useWorkspace';

export type Editing =
  | { kind: 'new-project' }
  | { kind: 'project'; id: string }
  | { kind: 'new-reminder'; projectId: string | null }
  | { kind: 'reminder'; id: string }
  | null;

type SaveResult = Promise<{ error: StorageError | null; id?: string }>;
type Props = {
  data: WorkspaceState;
  onRetry: () => void;
  editing: Editing;
  onEdit: (editing: Editing) => void;
  saveProject: (id: string | null, input: ProjectInput) => SaveResult;
  saveReminder: (id: string | null, input: ReminderInput) => SaveResult;
};

const emptyProject: ProjectInput = { name: '', description: '', deadline: '' };

export function Canvas({ data, onRetry, editing, onEdit, saveProject, saveReminder }: Props) {
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget, data]);

  if (data.status !== 'ready') return <main className="swish-canvas" aria-busy={data.status === 'loading'}>
    {data.status === 'loading' ? <p className="project">Opening local data…</p> : <section className="project storage-error" role="alert"><h2>Local data unavailable</h2><p>{data.error.message}</p><p>Your existing data has not been changed.</p><button type="button" className="suite-button primary" onClick={onRetry}>Try again</button></section>}
  </main>;

  const { projects, reminders } = data.workspace;
  const closeEditor = (target: string | null) => { onEdit(null); setFocusTarget(target); };

  /** The single reminder renderer for both contexts. */
  const card = (reminder: Reminder) => editing?.kind === 'reminder' && editing.id === reminder.id
    ? <ReminderForm key={reminder.id} title={`Edit ${reminder.title}`} projects={projects} submitLabel="Save reminder"
        initial={{ projectId: reminder.projectId, title: reminder.title, text: reminder.text, dueDate: reminder.dueDate }}
        onCancel={() => closeEditor(`edit-${reminder.id}`)}
        onSubmit={async input => { const r = await saveReminder(reminder.id, input); if (!r.error) closeEditor(`edit-${reminder.id}`); return r.error; }} />
    : <ReminderCard key={reminder.id} reminder={reminder} onEdit={() => onEdit({ kind: 'reminder', id: reminder.id })} />;

  /** Reminders for one context plus its create form when open. */
  const collection = (projectId: string | null, label: string, empty: string): ReactNode => {
    const items = reminders.filter(r => r.projectId === projectId);
    const creating = editing?.kind === 'new-reminder' && editing.projectId === projectId;
    const opener = projectId ? `new-reminder-${projectId}` : 'new-regular-reminder';
    return <>
      {items.length === 0 && !creating && <p className="empty-state">{empty}</p>}
      {items.length > 0 && <div className="project-reminders" tabIndex={projectId ? 0 : undefined} role={projectId ? 'region' : undefined} aria-label={projectId ? `Reminders in ${label}` : undefined}>{items.map(card)}</div>}
      {creating && <ReminderForm title="New reminder" projects={projects} submitLabel="Create reminder"
        initial={{ projectId, title: '', text: '', dueDate: null }}
        onCancel={() => closeEditor(opener)}
        onSubmit={async input => { const r = await saveReminder(null, input); if (!r.error) closeEditor(`reminder-${r.id}`); return r.error; }} />}
      <div className="entity-actions">
        <button id={opener} type="button" className="suite-button" disabled={creating} onClick={() => onEdit({ kind: 'new-reminder', projectId })} aria-label={projectId ? `New Reminder in ${label}` : 'New Regular Reminder'}>New Reminder</button>
      </div>
    </>;
  };

  return <main className="swish-canvas">
    <div className="canvas-heading"><h1>Projects</h1><button id="new-project" type="button" className="suite-button" disabled={editing?.kind === 'new-project'} onClick={() => onEdit({ kind: 'new-project' })}>New Project</button></div>
    {editing?.kind === 'new-project' && <ProjectForm title="New project" initial={emptyProject} submitLabel="Create project" onCancel={() => closeEditor('new-project')} onSubmit={async input => {
      const result = await saveProject(null, input);
      if (!result.error) closeEditor(`project-${result.id}`);
      return result.error;
    }} />}
    {projects.length === 0 && editing?.kind !== 'new-project' && <section className="project"><p>Your larger plans, one reminder at a time.</p><p className="empty-state">No projects yet.</p></section>}
    {projects.map(project => editing?.kind === 'project' && editing.id === project.id
      ? <ProjectForm key={project.id} title={`Edit ${project.name}`} initial={{ name: project.name, description: project.description, deadline: project.deadline }} submitLabel="Save project" onCancel={() => closeEditor(`edit-${project.id}`)} onSubmit={async input => {
          const result = await saveProject(project.id, input);
          if (!result.error) closeEditor(`edit-${project.id}`);
          return result.error;
        }} />
      : <ProjectPanel key={project.id} project={project} onEdit={() => onEdit({ kind: 'project', id: project.id })}>
          {collection(project.id, project.name, 'No reminders in this project yet.')}
        </ProjectPanel>)}
    <section className="project" aria-labelledby="regular-reminders"><h2 id="regular-reminders">Regular Reminders</h2>{collection(null, 'Regular Reminders', 'No reminders yet.')}</section>
  </main>;
}

function ProjectPanel({ project, onEdit, children }: { project: Project; onEdit: () => void; children: ReactNode }) {
  return <section className="project" aria-labelledby={`project-${project.id}`}>
    <header className="project-heading">
      <h2 id={`project-${project.id}`} tabIndex={-1}>{project.name}</h2>
      <span className="due">Deadline <time dateTime={project.deadline}>{formatDate(project.deadline)}</time></span>
    </header>
    {project.description && <p className="project-description">{project.description}</p>}
    {children}
    <div className="entity-actions">
      <button id={`edit-${project.id}`} type="button" className="suite-button" onClick={onEdit} aria-label={`Edit project ${project.name}`}>Edit Project</button>
    </div>
    <button type="button" className="suite-button destructive" disabled title="Safe deletion arrives in a later update" aria-label={`Delete project ${project.name} (not yet available)`}>Delete Project</button>
  </section>;
}

function ReminderCard({ reminder, onEdit }: { reminder: Reminder; onEdit: () => void }) {
  const done = reminder.completedAt !== null;
  return <article className="reminder" aria-labelledby={`reminder-${reminder.id}`} data-completed={done}>
    <div className="reminder-body">
      <div>
        <h3 id={`reminder-${reminder.id}`} tabIndex={-1}>{reminder.title}</h3>
        {reminder.dueDate && <p className="due">Due <time dateTime={reminder.dueDate}>{formatDate(reminder.dueDate)}</time></p>}
        {reminder.text && <p className="reminder-text">{reminder.text}</p>}
        <span className="completion-label">{done ? 'Completed' : 'Not completed'}</span>
      </div>
      <CompletionControl label={`Complete ${reminder.title}`} checked={done} disabled onChange={() => undefined} />
    </div>
    <div className="entity-actions">
      <button id={`edit-${reminder.id}`} type="button" className="suite-button" onClick={onEdit} aria-label={`Edit reminder ${reminder.title}`}>Edit Reminder</button>
    </div>
    <button type="button" className="suite-button destructive" disabled title="Safe deletion arrives in a later update" aria-label={`Delete reminder ${reminder.title} (not yet available)`}>Delete Reminder</button>
  </article>;
}
