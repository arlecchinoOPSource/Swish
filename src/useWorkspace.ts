import { useCallback, useEffect, useRef, useState } from 'react';
import { toStorageError, type StorageError, type Workspace } from './domain';
import type { SwishStorage } from './storage';

export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error'; error: StorageError };

/** Status of the most recent write. `saved` is set only after storage confirms the commit. */
/** The stored value comes straight from storage, never from inside a React updater. */
export type WriteResult<T> = { error: StorageError | null; value?: T };

export type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; error: StorageError };

/** Loads the canvas from storage. A failed load is shown, never replaced by empty data. */
export function useWorkspace(storage: SwishStorage) {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try { setState({ status: 'ready', workspace: await storage.loadWorkspace() }); }
    catch (error) { setState({ status: 'error', error: toStorageError(error) }); }
  }, [storage]);
  useEffect(() => { void reload(); }, [reload]);
  /** Re-reads without showing the loading state, so an open editor and its draft stay where they are. */
  const refresh = useCallback(async () => {
    try { setState({ status: 'ready', workspace: await storage.loadWorkspace() }); } catch { /* keep what is shown */ }
  }, [storage]);

  /**
   * Runs writes strictly one after another, in the order they were requested, so a
   * later change can never be overtaken by an earlier one. The canvas changes only
   * from what storage returns; a failed write leaves the canvas and the caller's draft
   * untouched. "Saved" is shown only once every queued write has committed.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const write = useCallback(<T,>(run: () => Promise<T>, apply: (workspace: Workspace, value: T) => Workspace): Promise<WriteResult<T>> => {
    pending.current += 1;
    setSave({ status: 'saving' });
    const task = queue.current.then(async (): Promise<WriteResult<T>> => {
      try {
        const value = await run();
        setState(current => current.status === 'ready' ? { status: 'ready', workspace: apply(current.workspace, value) } : current);
        return { error: null, value };
      } catch (thrown) {
        return { error: toStorageError(thrown) };
      }
    }).then(result => {
      pending.current -= 1;
      // An error shows until a later write succeeds; each failed caller also keeps
      // its own inline error and retry.
      setSave(result.error ? { status: 'error', error: result.error } : pending.current > 0 ? { status: 'saving' } : { status: 'saved' });
      return result;
    });
    queue.current = task;
    return task;
  }, []);
  /** Resolves once every write requested so far has finished (used before closing). */
  const flush = useCallback(() => queue.current.then(() => undefined, () => undefined), []);
  return { state, save, reload, refresh, write, flush };
}

/** Inserts or replaces by ID, keeping the store's project order (deadline, then creation). */
export function upsertProject(workspace: Workspace, project: Workspace['projects'][number]): Workspace {
  const projects = workspace.projects.filter(p => p.id !== project.id).concat(project)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { ...workspace, projects };
}

/** Inserts or replaces by ID, keeping creation order. A moved reminder keeps its place in time. */
export function upsertReminder(workspace: Workspace, reminder: Workspace['reminders'][number]): Workspace {
  const reminders = workspace.reminders.filter(r => r.id !== reminder.id).concat(reminder)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { ...workspace, reminders };
}

export function removeProject(workspace: Workspace, projectId: string): Workspace {
  return { projects: workspace.projects.filter(p => p.id !== projectId), reminders: workspace.reminders.filter(r => r.projectId !== projectId) };
}

export function removeReminder(workspace: Workspace, reminderId: string): Workspace {
  return { ...workspace, reminders: workspace.reminders.filter(r => r.id !== reminderId) };
}
