import { useCallback, useEffect, useState } from 'react';
import { toStorageError, type StorageError, type Workspace } from './domain';
import type { SwishStorage } from './storage';

export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error'; error: StorageError };

/** Status of the most recent write. `saved` is set only after storage confirms the commit. */
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

  /**
   * Runs one write. The canvas changes only from what storage returns, so a failed
   * write leaves both the canvas and the caller's draft untouched.
   */
  const write = useCallback(async <T,>(run: () => Promise<T>, apply: (workspace: Workspace, value: T) => Workspace): Promise<StorageError | null> => {
    setSave({ status: 'saving' });
    try {
      const value = await run();
      setState(current => current.status === 'ready' ? { status: 'ready', workspace: apply(current.workspace, value) } : current);
      setSave({ status: 'saved' });
      return null;
    } catch (thrown) {
      const error = toStorageError(thrown);
      setSave({ status: 'error', error });
      return error;
    }
  }, []);
  return { state, save, reload, write };
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
