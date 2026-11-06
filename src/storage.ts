import type { StorageError, Workspace } from './domain';

/**
 * Where projects and reminders live. `native` is the desktop app's SQLite file;
 * `preview` is the browser development preview, which keeps data in memory only
 * and must never be presented as saved.
 */
export interface SwishStorage {
  readonly kind: 'native' | 'preview';
  loadWorkspace(): Promise<Workspace>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    /** Test hook for the browser preview only: make the next operation fail. */
    __swishPreviewFault?: 'load' | 'write' | null;
  }
}

class NativeStorage implements SwishStorage {
  readonly kind = 'native';
  private async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  }
  loadWorkspace() { return this.call<Workspace>('load_workspace'); }
}

const previewFailure: StorageError = { code: 'storage', message: 'The browser preview simulated a storage failure. Nothing was changed.' };

/** In-memory adapter for `npm run dev:web` and UI tests. Nothing reaches disk. */
export class PreviewStorage implements SwishStorage {
  readonly kind = 'preview';
  protected data: Workspace = { projects: [], reminders: [] };
  protected fault(kind: 'load' | 'write') {
    if (window.__swishPreviewFault === kind) { window.__swishPreviewFault = null; throw previewFailure; }
  }
  protected snapshot(): Workspace { return structuredClone(this.data); }
  async loadWorkspace() { this.fault('load'); return this.snapshot(); }
}

export function createStorage(): SwishStorage {
  return window.__TAURI_INTERNALS__ ? new NativeStorage() : new PreviewStorage();
}
