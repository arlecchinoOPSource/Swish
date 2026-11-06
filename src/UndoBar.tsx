import { useEffect, useRef, useState } from 'react';
import type { Reminder, StorageError } from './domain';

export const UNDO_SECONDS = 10;

type Props = { reminder: Reminder; onUndo: () => Promise<StorageError | null>; onExpire: (hadFocus: boolean) => void };

/**
 * Offers Undo after a reminder is deleted. The countdown pauses while the bar has
 * pointer or keyboard focus, so nobody is rushed (WCAG 2.2.1).
 */
export function UndoBar({ reminder, onUndo, onExpire }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const undo = useRef<HTMLButtonElement>(null);
  const [remaining, setRemaining] = useState(UNDO_SECONDS);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StorageError | null>(null);
  useEffect(() => { undo.current?.focus(); }, []);
  // Tell the canvas how much room to keep clear when scrolling focus into view.
  useEffect(() => {
    const element = bar.current;
    const canvas = element?.closest<HTMLElement>('.swish-canvas');
    if (!element || !canvas) return;
    const observer = new ResizeObserver(() => canvas.style.setProperty('--undo-bar-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => { observer.disconnect(); canvas.style.removeProperty('--undo-bar-height'); };
  }, []);
  // Count down against a wall-clock deadline that restarts from what was left after a pause.
  const left = useRef(UNDO_SECONDS * 1000);
  useEffect(() => {
    if (paused || busy) return;
    const deadline = Date.now() + left.current;
    const timer = setInterval(() => {
      left.current = Math.max(0, deadline - Date.now());
      setRemaining(Math.ceil(left.current / 1000));
      if (left.current === 0) { clearInterval(timer); onExpire(!!bar.current?.contains(document.activeElement)); }
    }, 250);
    return () => clearInterval(timer);
  }, [paused, busy, onExpire]);
  async function run() {
    setBusy(true);
    const problem = await onUndo();
    setBusy(false);
    setError(problem);
  }
  return <div ref={bar} className="undo-bar" role="region" aria-label="Deleted reminder"
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={e => { if (!bar.current?.contains(e.relatedTarget as Node)) setPaused(false); }}>
    <p role="status">Deleted reminder “{reminder.title}”.{' '}
      <span className="undo-timer">{paused ? 'Undo stays available while you are here.' : `Undo available for ${remaining} s.`}</span></p>
    {error && <p className="form-error" role="alert">{error.message}</p>}
    <div className="form-actions">
      <button ref={undo} type="button" className="suite-button primary" disabled={busy} onClick={run}>{busy ? 'Restoring…' : 'Undo delete'}</button>
      <button type="button" className="suite-button" disabled={busy} onClick={() => onExpire(true)}>Dismiss</button>
    </div>
  </div>;
}
