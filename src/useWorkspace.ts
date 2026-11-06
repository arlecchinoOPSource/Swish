import { useCallback, useEffect, useState } from 'react';
import { toStorageError, type StorageError, type Workspace } from './domain';
import type { SwishStorage } from './storage';

export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error'; error: StorageError };

/** Loads the canvas from storage. A failed load is shown, never replaced by empty data. */
export function useWorkspace(storage: SwishStorage) {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });
  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try { setState({ status: 'ready', workspace: await storage.loadWorkspace() }); }
    catch (error) { setState({ status: 'error', error: toStorageError(error) }); }
  }, [storage]);
  useEffect(() => { void reload(); }, [reload]);
  return { state, setState, reload };
}
