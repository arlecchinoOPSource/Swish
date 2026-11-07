import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { checkProject, type ProjectInput, type StorageError } from './domain';

type Props = { modal?: boolean; title: string; initial: ProjectInput; submitLabel: string; onSubmit: (input: ProjectInput) => Promise<StorageError | null>; onCancel: () => void; onChange?: (values: ProjectInput) => void };

/** Create/edit form. The draft stays in place after any failure so nothing typed is lost. */
export function ProjectForm({ modal = false, title, initial, submitLabel, onSubmit, onCancel, onChange }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  // Mirror every change so it can be recovered after a restart.
  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => { report.current?.(draft); }, [draft]);
  const [error, setError] = useState<StorageError | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = { name: useRef<HTMLInputElement>(null), description: useRef<HTMLTextAreaElement>(null), deadline: useRef<HTMLInputElement>(null) };
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!modal) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, [modal]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkProject(draft) ?? (setBusy(true), await onSubmit(draft));
    setBusy(false);
    setError(problem);
    if (problem?.field && problem.field in fields) fields[problem.field as keyof typeof fields].current?.focus();
  }
  const invalid = (field: keyof typeof fields) => error?.field === field;
  const describe = (field: keyof typeof fields) => invalid(field) ? `${id}-error` : undefined;
  const form = <form className="project entity-form" aria-labelledby={`${id}-title`} onSubmit={submit} noValidate>
    <h2 id={`${id}-title`} className={modal ? 'visually-hidden' : undefined}>{title}</h2>
    <label htmlFor={`${id}-name`}>Project name <span className="required">(required)</span></label>
    <input id={`${id}-name`} ref={fields.name} className="suite-input" value={draft.name} maxLength={200} autoFocus aria-required="true" aria-invalid={invalid('name')} aria-describedby={describe('name')} onChange={e => setDraft({ ...draft, name: e.target.value })} />
    <label htmlFor={`${id}-description`}>Description <span className="optional">(optional)</span></label>
    <textarea id={`${id}-description`} ref={fields.description} className="suite-input" rows={3} value={draft.description} maxLength={10000} aria-invalid={invalid('description')} aria-describedby={describe('description')} onChange={e => setDraft({ ...draft, description: e.target.value })} />
    <label htmlFor={`${id}-deadline`}>Project deadline <span className="required">(required)</span></label>
    <input id={`${id}-deadline`} ref={fields.deadline} className="suite-input" type="date" min="1000-01-01" max="9999-12-31" value={draft.deadline} aria-required="true" aria-invalid={invalid('deadline')} aria-describedby={describe('deadline')} onChange={e => setDraft({ ...draft, deadline: e.target.value })} />
    {error && <p id={`${id}-error`} className="form-error" role="alert">{error.message}{error.field ? '' : ' Your changes are still here — save again to retry.'}</p>}
    <div className="form-actions">
      <button type="submit" className="suite-button primary" disabled={busy}>{busy ? 'Saving…' : error && !error.field ? 'Retry save' : submitLabel}</button>
      <button type="button" className="suite-button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
  if (!modal) return form;
  return <dialog ref={dialog} className="project-modal" aria-labelledby={`${id}-title`}
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <button type="button" className="suite-button" aria-label="Close new project" disabled={busy} onClick={onCancel}>Close</button>
    {form}
  </dialog>;
}
