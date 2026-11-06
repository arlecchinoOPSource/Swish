import { useEffect, useRef, useState } from 'react';
import { formatDate, type Project, type ProjectInput, type Reminder, type StorageError } from './domain';
import { ProjectForm } from './ProjectForm';
import type { WorkspaceState } from './useWorkspace';

export type Editing = { kind: 'new-project' } | { kind: 'project'; id: string } | null;

type Props = {
  data: WorkspaceState;
  onRetry: () => void;
  editing: Editing;
  onEdit: (editing: Editing) => void;
  saveProject: (id: string | null, input: ProjectInput) => Promise<{ error: StorageError | null; id?: string }>;
};

const emptyProject: ProjectInput = { name: '', description: '', deadline: '' };

export function Canvas({ data, onRetry, editing, onEdit, saveProject }: Props) {
  const newProjectButton = useRef<HTMLButtonElement>(null);
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
  const remindersOf = (projectId: string | null) => reminders.filter(r => r.projectId === projectId);
  const closeEditor = (target: string | null) => { onEdit(null); setFocusTarget(target); };

  return <main className="swish-canvas">
    <div className="canvas-heading"><h1>Projects</h1><button ref={newProjectButton} id="new-project" type="button" className="suite-button" disabled={editing?.kind === 'new-project'} onClick={() => onEdit({ kind: 'new-project' })}>New Project</button></div>
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
      : <ProjectPanel key={project.id} project={project} reminders={remindersOf(project.id)} onEdit={() => onEdit({ kind: 'project', id: project.id })} />)}
    <section className="project" aria-labelledby="regular-reminders"><h2 id="regular-reminders">Regular Reminders</h2>{remindersOf(null).length === 0 && <p className="empty-state">No reminders yet.</p>}</section>
  </main>;
}

function ProjectPanel({ project, reminders, onEdit }: { project: Project; reminders: Reminder[]; onEdit: () => void }) {
  return <section className="project" aria-labelledby={`project-${project.id}`}>
    <header className="project-heading">
      <h2 id={`project-${project.id}`} tabIndex={-1}>{project.name}</h2>
      <span className="due">Deadline <time dateTime={project.deadline}>{formatDate(project.deadline)}</time></span>
    </header>
    {project.description && <p className="project-description">{project.description}</p>}
    {reminders.length === 0 && <p className="empty-state">No reminders in this project yet.</p>}
    <div className="entity-actions">
      <button id={`edit-${project.id}`} type="button" className="suite-button" onClick={onEdit} aria-label={`Edit project ${project.name}`}>Edit Project</button>
    </div>
    <button type="button" className="suite-button destructive" disabled title="Safe deletion arrives in a later update" aria-label={`Delete project ${project.name} (not yet available)`}>Delete Project</button>
  </section>;
}
