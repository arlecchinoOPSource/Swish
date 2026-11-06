import { checkProject, type Project, type ProjectInput, type StorageError, type Workspace } from './domain';

/**
 * Where projects and reminders live. `native` is the desktop app's SQLite file;
 * `preview` is the browser development preview, which keeps data in memory only
 * and must never be presented as saved.
 */
export interface SwishStorage {
  readonly kind: 'native' | 'preview';
  loadWorkspace(): Promise<Workspace>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, input: ProjectInput): Promise<Project>;
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
  createProject(input: ProjectInput) { return this.call<Project>('create_project', { input }); }
  updateProject(id: string, input: ProjectInput) { return this.call<Project>('update_project', { id, input }); }
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
  protected now() { return new Date().toISOString(); }
  protected cleanProject(input: ProjectInput): ProjectInput {
    const clean = { name: input.name.trim(), description: input.description.trim(), deadline: input.deadline.trim() };
    const error = checkProject(clean);
    if (error) throw error;
    return clean;
  }
  async createProject(input: ProjectInput) {
    const clean = this.cleanProject(input);
    this.fault('write');
    const now = this.now();
    const project: Project = { id: crypto.randomUUID(), ...clean, createdAt: now, updatedAt: now };
    this.data.projects.push(project);
    this.data.projects.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt));
    return structuredClone(project);
  }
  async updateProject(id: string, input: ProjectInput) {
    const clean = this.cleanProject(input);
    this.fault('write');
    const project = this.data.projects.find(p => p.id === id);
    if (!project) throw { code: 'notFound', message: 'That project no longer exists.' } satisfies StorageError;
    Object.assign(project, clean, { updatedAt: this.now() });
    this.data.projects.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt));
    return structuredClone(project);
  }
}

export function createStorage(): SwishStorage {
  return window.__TAURI_INTERNALS__ ? new NativeStorage() : new PreviewStorage();
}
