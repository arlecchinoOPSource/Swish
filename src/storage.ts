import { countsOf, parseBackup, suggestedFileName, toBackup, type BackupFile, type Counts, type ExportResult, type InspectResult, type RestoreResult } from './backup';
import { checkProject, checkReminder, type DeletedProject, type Project, type ProjectInput, type Reminder, type ReminderInput, type StorageError, type Workspace } from './domain';

/**
 * Where projects and reminders live. `native` is the desktop app's SQLite file;
 * `preview` is the browser development preview, which keeps data in memory only
 * and must never be presented as saved.
 */
export interface SwishStorage {
  readonly kind: 'native' | 'preview';
  loadWorkspace(): Promise<Workspace>;
  createProject(input: ProjectInput): Promise<Project>;
  /** `expectedUpdatedAt`: the `updatedAt` the caller last read; if the stored one differs, nothing is saved and a `changed` error is thrown. */
  updateProject(id: string, input: ProjectInput, expectedUpdatedAt?: string): Promise<Project>;
  createReminder(input: ReminderInput): Promise<Reminder>;
  updateReminder(id: string, input: ReminderInput, expectedUpdatedAt?: string): Promise<Reminder>;
  setReminderCompleted(id: string, completed: boolean): Promise<Reminder>;
  /** Deletes the project and its reminders only if it still has `expectedReminders`. */
  deleteProject(id: string, expectedReminders: number): Promise<DeletedProject>;
  /** Deletes a reminder and returns it for Undo. */
  deleteReminder(id: string): Promise<Reminder>;
  /** Restores a deleted reminder with its original ID and history. */
  restoreReminder(reminder: Reminder): Promise<Reminder>;
  /** Saves a backup file chosen by the user. */
  exportBackup(): Promise<ExportResult>;
  /** Lets the user choose a backup and validates it without changing anything. */
  inspectBackup(): Promise<InspectResult>;
  cancelRestore(): Promise<void>;
  /** Saves a safety copy, then replaces all data with the inspected backup. */
  restoreBackup(token: string): Promise<RestoreResult>;
  /** Puts back the data replaced by the last restore. */
  undoRestore(): Promise<Counts>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    /** Test hook for the browser preview only: make the next operation fail. */
    __swishPreviewFault?: 'load' | 'write' | null;
    /** Test hook: preview writes take this many milliseconds. */
    __swishPreviewDelay?: number;
    /** Test hook: set to true if two preview writes ever overlap. */
    __swishPreviewOverlap?: boolean;
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
  updateProject(id: string, input: ProjectInput, expectedUpdatedAt?: string) { return this.call<Project>('update_project', { id, input, expectedUpdatedAt }); }
  createReminder(input: ReminderInput) { return this.call<Reminder>('create_reminder', { input }); }
  updateReminder(id: string, input: ReminderInput, expectedUpdatedAt?: string) { return this.call<Reminder>('update_reminder', { id, input, expectedUpdatedAt }); }
  setReminderCompleted(id: string, completed: boolean) { return this.call<Reminder>('set_reminder_completed', { id, completed }); }
  deleteProject(id: string, expectedReminders: number) { return this.call<DeletedProject>('delete_project', { id, expectedReminders }); }
  deleteReminder(id: string) { return this.call<Reminder>('delete_reminder', { id }); }
  restoreReminder(reminder: Reminder) { return this.call<Reminder>('restore_reminder', { reminder }); }
  exportBackup() { return this.call<ExportResult>('export_backup'); }
  inspectBackup() { return this.call<InspectResult>('inspect_backup'); }
  cancelRestore() { return this.call<void>('cancel_restore'); }
  restoreBackup(token: string) { return this.call<RestoreResult>('restore_backup', { token }); }
  undoRestore() { return this.call<Counts>('undo_restore'); }
}

const changedElsewhere = (entity: string): StorageError => ({ code: 'changed', message: `That ${entity} was changed somewhere else after you opened it. Nothing was saved over it and your edits are still here; saving again replaces the other change.` });

const previewFailure: StorageError = { code: 'storage', message: 'The browser preview simulated a storage failure. Nothing was changed.' };

/** In-memory adapter for `npm run dev:web` and UI tests. Nothing reaches disk. */
export class PreviewStorage implements SwishStorage {
  readonly kind = 'preview';
  protected data: Workspace = { projects: [], reminders: [] };
  protected fault(kind: 'load' | 'write') {
    if (window.__swishPreviewFault === kind) { window.__swishPreviewFault = null; throw previewFailure; }
  }
  private busy = false;
  /** Simulated write latency; flags overlapping writes, which the app must never issue. */
  protected async writing() {
    if (this.busy) window.__swishPreviewOverlap = true;
    this.busy = true;
    try {
      const delay = window.__swishPreviewDelay ?? 0;
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      this.fault('write');
    } finally { this.busy = false; }
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
    await this.writing();
    const now = this.now();
    const project: Project = { id: crypto.randomUUID(), ...clean, createdAt: now, updatedAt: now };
    this.data.projects.push(project);
    this.data.projects.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt));
    return structuredClone(project);
  }
  async updateProject(id: string, input: ProjectInput, expectedUpdatedAt?: string) {
    const clean = this.cleanProject(input);
    await this.writing();
    const project = this.data.projects.find(p => p.id === id);
    if (!project) throw { code: 'notFound', message: 'That project no longer exists.' } satisfies StorageError;
    if (expectedUpdatedAt !== undefined && project.updatedAt !== expectedUpdatedAt) throw changedElsewhere('project');
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
    await this.writing();
    const now = this.now();
    const reminder: Reminder = { id: crypto.randomUUID(), ...clean, completedAt: null, createdAt: now, updatedAt: now };
    this.data.reminders.push(reminder);
    return structuredClone(reminder);
  }
  async updateReminder(id: string, input: ReminderInput, expectedUpdatedAt?: string) {
    const clean = this.cleanReminder(input);
    await this.writing();
    const reminder = this.data.reminders.find(r => r.id === id);
    if (!reminder) throw { code: 'notFound', message: 'That reminder no longer exists.' } satisfies StorageError;
    if (expectedUpdatedAt !== undefined && reminder.updatedAt !== expectedUpdatedAt) throw changedElsewhere('reminder');
    Object.assign(reminder, clean, { updatedAt: this.now() });
    return structuredClone(reminder);
  }
  async setReminderCompleted(id: string, completed: boolean) {
    await this.writing();
    const reminder = this.data.reminders.find(r => r.id === id);
    if (!reminder) throw { code: 'notFound', message: 'That reminder no longer exists.' } satisfies StorageError;
    if (completed !== (reminder.completedAt !== null)) Object.assign(reminder, { completedAt: completed ? this.now() : null, updatedAt: this.now() });
    return structuredClone(reminder);
  }
  async deleteProject(id: string, expectedReminders: number) {
    await this.writing();
    if (!this.data.projects.some(p => p.id === id)) throw { code: 'notFound', message: 'That project no longer exists.' } satisfies StorageError;
    const count = this.data.reminders.filter(r => r.projectId === id).length;
    if (count !== expectedReminders) throw { code: 'changed', message: `This project now has ${count} reminder${count === 1 ? '' : 's'}, not ${expectedReminders}. Nothing was deleted; review and confirm again.` } satisfies StorageError;
    this.data.projects = this.data.projects.filter(p => p.id !== id);
    this.data.reminders = this.data.reminders.filter(r => r.projectId !== id);
    return { projectId: id, deletedReminders: count };
  }
  async deleteReminder(id: string) {
    await this.writing();
    const reminder = this.data.reminders.find(r => r.id === id);
    if (!reminder) throw { code: 'notFound', message: 'That reminder no longer exists.' } satisfies StorageError;
    this.data.reminders = this.data.reminders.filter(r => r.id !== id);
    return structuredClone(reminder);
  }
  async restoreReminder(snapshot: Reminder) {
    if (snapshot.projectId && !this.data.projects.some(p => p.id === snapshot.projectId)) throw { code: 'invalid', field: 'projectId', message: 'Project was deleted, so this reminder cannot be restored into it.' } satisfies StorageError;
    const clean = this.cleanReminder(snapshot);
    await this.writing();
    if (this.data.reminders.some(r => r.id === snapshot.id)) throw { code: 'changed', message: 'That reminder is already present. Nothing was changed.' } satisfies StorageError;
    const reminder: Reminder = { ...snapshot, ...clean, updatedAt: this.now() };
    this.data.reminders.push(reminder);
    this.data.reminders.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return structuredClone(reminder);
  }
  private pending: { token: string; backup: BackupFile } | null = null;
  private safety: Workspace | null = null;
  /** Browser download; the browser decides where it goes. */
  async exportBackup(): Promise<ExportResult> {
    const backup = toBackup(this.data);
    const fileName = suggestedFileName(backup.exportedAt);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'saved', fileName, counts: countsOf(backup) };
  }
  async inspectBackup(): Promise<InspectResult> {
    this.pending = null;
    const file = await new Promise<File | null>(resolve => {
      // Attached (but hidden): WebKit does not reliably fire events on detached file inputs.
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
      const done = (file: File | null) => { input.remove(); resolve(file); };
      input.addEventListener('change', () => done(input.files?.[0] ?? null));
      input.addEventListener('cancel', () => done(null));
      document.body.append(input);
      input.click();
    });
    if (!file) return { status: 'cancelled' };
    const backup = parseBackup(await file.text());
    const token = crypto.randomUUID();
    this.pending = { token, backup };
    return { status: 'ready', token, fileName: file.name, exportedAt: backup.exportedAt, backup: countsOf(backup), current: countsOf(this.data) };
  }
  async cancelRestore() { this.pending = null; }
  async restoreBackup(token: string): Promise<RestoreResult> {
    const pending = this.pending;
    if (!pending || pending.token !== token) throw { code: 'changed', message: 'That backup is no longer selected. Choose the file again.' } satisfies StorageError;
    await this.writing();
    this.pending = null;
    this.safety = structuredClone(this.data);
    this.data = { projects: structuredClone(pending.backup.projects), reminders: structuredClone(pending.backup.reminders) };
    return { restored: countsOf(this.data), safetyCopy: 'kept in memory (browser preview)' };
  }
  async undoRestore(): Promise<Counts> {
    if (!this.safety) throw { code: 'changed', message: 'There is no restore to undo.' } satisfies StorageError;
    await this.writing();
    this.data = this.safety;
    this.safety = null;
    return countsOf(this.data);
  }
}

export function createStorage(): SwishStorage {
  return window.__TAURI_INTERNALS__ ? new NativeStorage() : new PreviewStorage();
}
