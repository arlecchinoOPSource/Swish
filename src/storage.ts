import { checkProject, checkReminder, type Project, type ProjectInput, type Reminder, type ReminderInput, type StorageError, type Workspace } from './domain';

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
  createReminder(input: ReminderInput): Promise<Reminder>;
  updateReminder(id: string, input: ReminderInput): Promise<Reminder>;
  setReminderCompleted(id: string, completed: boolean): Promise<Reminder>;
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
  createReminder(input: ReminderInput) { return this.call<Reminder>('create_reminder', { input }); }
  updateReminder(id: string, input: ReminderInput) { return this.call<Reminder>('update_reminder', { id, input }); }
  setReminderCompleted(id: string, completed: boolean) { return this.call<Reminder>('set_reminder_completed', { id, completed }); }
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
  protected cleanReminder(input: ReminderInput): ReminderInput {
    const clean = { projectId: input.projectId || null, title: input.title.trim(), text: input.text.trim(), dueDate: input.dueDate?.trim() || null };
    const error = checkReminder(clean);
    if (error) throw error;
    if (clean.projectId && !this.data.projects.some(p => p.id === clean.projectId)) throw { code: 'invalid', field: 'projectId', message: 'Project no longer exists; choose another project or Regular Reminders.' } satisfies StorageError;
    return clean;
  }
  async createReminder(input: ReminderInput) {
    const clean = this.cleanReminder(input);
    this.fault('write');
    const now = this.now();
    const reminder: Reminder = { id: crypto.randomUUID(), ...clean, completedAt: null, createdAt: now, updatedAt: now };
    this.data.reminders.push(reminder);
    return structuredClone(reminder);
  }
  async updateReminder(id: string, input: ReminderInput) {
    const clean = this.cleanReminder(input);
    this.fault('write');
    const reminder = this.data.reminders.find(r => r.id === id);
    if (!reminder) throw { code: 'notFound', message: 'That reminder no longer exists.' } satisfies StorageError;
    Object.assign(reminder, clean, { updatedAt: this.now() });
    return structuredClone(reminder);
  }
  async setReminderCompleted(id: string, completed: boolean) {
    this.fault('write');
    const reminder = this.data.reminders.find(r => r.id === id);
    if (!reminder) throw { code: 'notFound', message: 'That reminder no longer exists.' } satisfies StorageError;
    if (completed !== (reminder.completedAt !== null)) Object.assign(reminder, { completedAt: completed ? this.now() : null, updatedAt: this.now() });
    return structuredClone(reminder);
  }
}

export function createStorage(): SwishStorage {
  return window.__TAURI_INTERNALS__ ? new NativeStorage() : new PreviewStorage();
}
