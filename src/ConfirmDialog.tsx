import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { StorageError } from './domain';

type Props = { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => Promise<StorageError | null>; onCancel: () => void };

/**
 * Modal confirmation for irreversible actions. Cancel has initial focus, Escape
 * cancels, and a failed action keeps the dialog open with the reason and a retry.
 */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StorageError | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    cancel.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, []);
  async function confirm() {
    setBusy(true);
    setError(null);
    const problem = await onConfirm();
    setBusy(false);
    if (problem) setError(problem);
  }
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={`${id}-title`}>{title}</h2>
    <div id={`${id}-body`}>{children}</div>
    {error && <p className="form-error" role="alert">{error.message}</p>}
    <div className="form-actions">
      <button ref={cancel} type="button" className="suite-button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="suite-button destructive" disabled={busy} onClick={confirm}>{busy ? 'Deleting…' : error ? `Retry: ${confirmLabel}` : confirmLabel}</button>
    </div>
  </dialog>;
}
