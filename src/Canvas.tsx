import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CompletionControl } from '@arlecchino/suite-ui';
import { formatDate, progressOf, type Project, type ProjectInput, type Reminder, type ReminderInput, type StorageError } from './domain';
import { ConfirmDialog } from './ConfirmDialog';
import { ProjectForm } from './ProjectForm';
import { UndoBar } from './UndoBar';
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
  setCompleted: (id: string, completed: boolean) => Promise<StorageError | null>;
  deleteProject: (id: string, expectedReminders: number) => Promise<StorageError | null>;
  deleteReminder: (id: string) => Promise<{ error: StorageError | null; removed?: Reminder }>;
  restoreReminder: (reminder: Reminder) => Promise<StorageError | null>;
};

const emptyProject: ProjectInput = { name: '', description: '', deadline: '' };

export function Canvas({ data, onRetry, editing, onEdit, saveProject, saveReminder, setCompleted, deleteProject, deleteReminder, restoreReminder }: Props) {
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ project: Project; count: number } | null>(null);
  const [undo, setUndo] = useState<Reminder | null>(null);
  const expireUndo = useCallback((hadFocus: boolean) => {
    // Deletion is now final. Keep keyboard users in the same section.
    if (undo && hadFocus) setFocusTarget(undo.projectId ? `new-reminder-${undo.projectId}` : 'new-regular-reminder');
    setUndo(null);
  }, [undo]);
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
    : <ReminderCard key={reminder.id} reminder={reminder} onEdit={() => onEdit({ kind: 'reminder', id: reminder.id })} onToggle={completed => setCompleted(reminder.id, completed)}
        onDelete={async () => { const r = await deleteReminder(reminder.id); if (r.removed) setUndo(r.removed); return r.error; }} />;

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
      : <ProjectPanel key={project.id} project={project} reminders={reminders.filter(r => r.projectId === project.id)} onEdit={() => onEdit({ kind: 'project', id: project.id })}
          onDelete={count => setConfirming({ project, count })}>
          {collection(project.id, project.name, 'No reminders in this project yet.')}
        </ProjectPanel>)}
    <section className="project" aria-labelledby="regular-reminders"><h2 id="regular-reminders">Regular Reminders</h2>{collection(null, 'Regular Reminders', 'No reminders yet.')}</section>
    {undo && <UndoBar key={undo.id} reminder={undo} onExpire={expireUndo} onUndo={async () => {
      const error = await restoreReminder(undo);
      if (!error) { setUndo(null); setFocusTarget(`reminder-${undo.id}`); }
      return error;
    }} />}
    {confirming && <ConfirmDialog title={`Delete project “${confirming.project.name}”?`} confirmLabel="Delete project"
      onCancel={() => { const id = confirming.project.id; setConfirming(null); setFocusTarget(`delete-${id}`); }}
      onConfirm={async () => {
        const error = await deleteProject(confirming.project.id, confirming.count);
        if (!error) { setConfirming(null); setFocusTarget('new-project'); }
        return error;
      }}>
      <p>{confirming.count === 0 ? 'This project has no reminders.' : `This also deletes its ${confirming.count} reminder${confirming.count === 1 ? '' : 's'}, completed or not.`}</p>
      <p><strong>This cannot be undone.</strong> Regular reminders and other projects are not affected.</p>
    </ConfirmDialog>}
  </main>;
}

function ProjectPanel({ project, reminders, onEdit, onDelete, children }: { project: Project; reminders: Reminder[]; onEdit: () => void; onDelete: (count: number) => void; children: ReactNode }) {
  const { done, total } = progressOf(reminders);
  return <section className="project" aria-labelledby={`project-${project.id}`}>
    <header className="project-heading">
      <h2 id={`project-${project.id}`} tabIndex={-1}>{project.name}</h2>
      <span className="due">Deadline <time dateTime={project.deadline}>{formatDate(project.deadline)}</time></span>
    </header>
    {project.description && <p className="project-description">{project.description}</p>}
    <div className="project-progress" data-complete={total > 0 && done === total}>
      <span className="progress-text">{total === 0 ? 'No reminders to complete yet' : `${done} of ${total} completed${done === total ? ' — all done' : ''}`}</span>
      <span className="progress-track" aria-hidden="true"><span style={{ width: total ? `${(done / total) * 100}%` : '0%' }} /></span>
    </div>
    {children}
    <div className="entity-actions">
      <button id={`edit-${project.id}`} type="button" className="suite-button" onClick={onEdit} aria-label={`Edit project ${project.name}`}>Edit Project</button>
    </div>
    <button id={`delete-${project.id}`} type="button" className="suite-button destructive" onClick={() => onDelete(total)} aria-label={`Delete project ${project.name} and its ${total} reminder${total === 1 ? '' : 's'}`}>Delete Project</button>
  </section>;
}

function ReminderCard({ reminder, onEdit, onToggle, onDelete }: { reminder: Reminder; onEdit: () => void; onToggle: (completed: boolean) => Promise<StorageError | null>; onDelete: () => Promise<StorageError | null> }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<StorageError | null>(null);
  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    const error = await onDelete();
    // On success this card unmounts; on failure it stays with the reason.
    if (error) { setDeleting(false); setDeleteError(error); }
  }
  const done = reminder.completedAt !== null;
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState<{ wanted: boolean; error: StorageError } | null>(null);
  async function toggle(wanted: boolean) {
    if (pending !== null) return;
    setPending(wanted);
    setFailed(null);
    const error = await onToggle(wanted);
    setPending(null);
    // On failure the control keeps showing the stored state; nothing is assumed saved.
    if (error) setFailed({ wanted, error });
  }
  const label = pending !== null ? (pending ? 'Saving completion…' : 'Saving reopen…') : done ? 'Completed' : 'Not completed';
  return <article className="reminder" aria-labelledby={`reminder-${reminder.id}`} data-completed={done} aria-busy={pending !== null}>
    <div className="reminder-body">
      <div>
        <h3 id={`reminder-${reminder.id}`} tabIndex={-1}>{reminder.title}</h3>
        {reminder.dueDate && <p className="due">Due <time dateTime={reminder.dueDate}>{formatDate(reminder.dueDate)}</time></p>}
        {reminder.text && <p className="reminder-text">{reminder.text}</p>}
        <span className="completion-label">{done && pending === null ? '✓ ' : ''}{label}</span>
      </div>
      <CompletionControl label={`Complete ${reminder.title}`} checked={done} disabled={pending !== null} onChange={toggle} />
    </div>
    {failed && <div className="form-error card-error" role="alert">
      {failed.wanted ? 'Not marked complete' : 'Not reopened'}: {failed.error.message}
      <button type="button" className="suite-button" onClick={() => toggle(failed.wanted)}>Retry</button>
    </div>}
    <div className="entity-actions">
      <button id={`edit-${reminder.id}`} type="button" className="suite-button" onClick={onEdit} aria-label={`Edit reminder ${reminder.title}`}>Edit Reminder</button>
    </div>
    {deleteError && <p className="form-error" role="alert">Not deleted: {deleteError.message}</p>}
    <button type="button" className="suite-button destructive" disabled={deleting} onClick={remove} aria-label={`Delete reminder ${reminder.title}`}>{deleting ? 'Deleting…' : deleteError ? 'Retry delete' : 'Delete Reminder'}</button>
  </article>;
}
