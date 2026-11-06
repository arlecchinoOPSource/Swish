import { useId, useRef, useState, type FormEvent } from 'react';
import { checkReminder, type Project, type ReminderInput, type StorageError } from './domain';

type Props = { title: string; initial: ReminderInput; projects: Project[]; submitLabel: string; onSubmit: (input: ReminderInput) => Promise<StorageError | null>; onCancel: () => void };

/** One form for regular and project reminders. The draft survives every failure. */
export function ReminderForm({ title, initial, projects, submitLabel, onSubmit, onCancel }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<StorageError | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = { title: useRef<HTMLInputElement>(null), text: useRef<HTMLTextAreaElement>(null), dueDate: useRef<HTMLInputElement>(null), projectId: useRef<HTMLSelectElement>(null) };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkReminder(draft) ?? (setBusy(true), await onSubmit(draft));
    setBusy(false);
    setError(problem);
    if (problem?.field && problem.field in fields) fields[problem.field as keyof typeof fields].current?.focus();
  }
  const invalid = (field: keyof typeof fields) => error?.field === field;
  const describe = (field: keyof typeof fields) => invalid(field) ? `${id}-error` : undefined;
  return <form className="reminder entity-form" aria-labelledby={`${id}-title`} onSubmit={submit} noValidate>
    <h3 id={`${id}-title`}>{title}</h3>
    <label htmlFor={`${id}-header`}>Reminder header <span className="required">(required)</span></label>
    <input id={`${id}-header`} ref={fields.title} className="suite-input" value={draft.title} maxLength={200} autoFocus aria-required="true" aria-invalid={invalid('title')} aria-describedby={describe('title')} onChange={e => setDraft({ ...draft, title: e.target.value })} />
    <label htmlFor={`${id}-text`}>Reminder text <span className="optional">(optional)</span></label>
    <textarea id={`${id}-text`} ref={fields.text} className="suite-input" rows={3} value={draft.text} maxLength={10000} aria-invalid={invalid('text')} aria-describedby={describe('text')} onChange={e => setDraft({ ...draft, text: e.target.value })} />
    <label htmlFor={`${id}-due`}>Due date <span className="optional">(optional)</span></label>
    <div className="date-row">
      <input id={`${id}-due`} ref={fields.dueDate} className="suite-input" type="date" min="1000-01-01" max="9999-12-31" value={draft.dueDate ?? ''} aria-invalid={invalid('dueDate')} aria-describedby={describe('dueDate')} onChange={e => setDraft({ ...draft, dueDate: e.target.value || null })} />
      {draft.dueDate && <button type="button" className="suite-button" onClick={() => setDraft({ ...draft, dueDate: null })}>Clear due date</button>}
    </div>
    <label htmlFor={`${id}-project`}>Project</label>
    <select id={`${id}-project`} ref={fields.projectId} className="suite-input" value={draft.projectId ?? ''} aria-invalid={invalid('projectId')} aria-describedby={describe('projectId')} onChange={e => setDraft({ ...draft, projectId: e.target.value || null })}>
      <option value="">Regular Reminders (no project)</option>
      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    {error && <p id={`${id}-error`} className="form-error" role="alert">{error.message}{error.field ? '' : ' Your changes are still here — save again to retry.'}</p>}
    <div className="form-actions">
      <button type="submit" className="suite-button primary" disabled={busy}>{busy ? 'Saving…' : error && !error.field ? 'Retry save' : submitLabel}</button>
      <button type="button" className="suite-button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
