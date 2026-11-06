import { checkProject, checkReminder, type Project, type Reminder, type StorageError, type Workspace } from './domain';

/**
 * Browser-preview mirror of swish-data's backup rules. The native app validates in
 * Rust; this exists so the preview and UI tests exercise the same flows and messages.
 */
export const BACKUP_FORMAT = 'swish-backup';
export const BACKUP_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export type Counts = { projects: number; reminders: number };
export type BackupFile = { format: string; version: number; schemaVersion: number; exportedAt: string; projects: Project[]; reminders: Reminder[] };
export type ExportResult = { status: 'cancelled' } | { status: 'saved'; fileName: string; counts: Counts };
export type InspectResult = { status: 'cancelled' } | { status: 'ready'; token: string; fileName: string; exportedAt: string; backup: Counts; current: Counts };
export type RestoreResult = { restored: Counts; safetyCopy: string };

const fail = (message: string): never => { throw { code: 'invalidBackup', message: `${message} Nothing was changed.` } satisfies StorageError; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isStamp = (v: unknown) => typeof v === 'string' && STAMP.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).length === keys.length && keys.every(k => k in o);

export function toBackup(workspace: Workspace, exportedAt = new Date().toISOString()): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt, ...structuredClone(workspace) };
}

export const countsOf = (w: { projects: unknown[]; reminders: unknown[] }): Counts => ({ projects: w.projects.length, reminders: w.reminders.length });

export function suggestedFileName(exportedAt: string) { return `swish-backup-${exportedAt.slice(0, 10)}.json`; }

export function parseBackup(text: string): BackupFile {
  if (text.length > MAX_BACKUP_BYTES) fail('The file is too large to be a Swish backup.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('The file is not a readable Swish backup.'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('The file is not a readable Swish backup.');
  const b = value as Record<string, unknown>;
  if (b.format !== BACKUP_FORMAT) fail('The file is not a Swish backup.');
  if (typeof b.version === 'number' && b.version > BACKUP_VERSION) fail(`This backup was made by a newer version of Swish (backup format ${b.version}). Update Swish to restore it.`);
  if (b.version !== BACKUP_VERSION) fail('This backup format is not supported by this version of Swish.');
  if (!exact(b, ['format', 'version', 'schemaVersion', 'exportedAt', 'projects', 'reminders']) || !Array.isArray(b.projects) || !Array.isArray(b.reminders) || typeof b.schemaVersion !== 'number') fail('The backup is damaged or incomplete.');
  if ((b.schemaVersion as number) < 1 || (b.schemaVersion as number) > SCHEMA_VERSION) fail(`This backup lists data schema ${b.schemaVersion}, which this version of Swish cannot restore.`);
  if (!isStamp(b.exportedAt)) fail('The backup’s export time is unreadable.');
  const projectIds = new Set<string>();
  (b.projects as unknown[]).forEach((raw, i) => {
    const at = (what: string) => fail(`Project ${i + 1} ${what}.`);
    if (typeof raw !== 'object' || raw === null) return at('is damaged');
    const p = raw as Record<string, unknown>;
    if (!exact(p, ['id', 'name', 'description', 'deadline', 'createdAt', 'updatedAt']) || ![p.name, p.description, p.deadline].every(v => typeof v === 'string')) return fail('The backup is damaged or incomplete.');
    if (typeof p.id !== 'string' || !UUID.test(p.id)) at('has an invalid identifier');
    if (projectIds.has(p.id as string)) at('repeats an identifier used by another project');
    projectIds.add(p.id as string);
    const problem = checkProject({ name: p.name as string, description: p.description as string, deadline: p.deadline as string });
    if (problem) at(`is invalid: ${problem.message}`);
    if (!isStamp(p.createdAt) || !isStamp(p.updatedAt)) at('has an unreadable timestamp');
  });
  const reminderIds = new Set<string>();
  (b.reminders as unknown[]).forEach((raw, i) => {
    const at = (what: string) => fail(`Reminder ${i + 1} ${what}.`);
    if (typeof raw !== 'object' || raw === null) return at('is damaged');
    const r = raw as Record<string, unknown>;
    if (!exact(r, ['id', 'projectId', 'title', 'text', 'dueDate', 'completedAt', 'createdAt', 'updatedAt']) || typeof r.title !== 'string' || typeof r.text !== 'string') return fail('The backup is damaged or incomplete.');
    if (typeof r.id !== 'string' || !UUID.test(r.id)) at('has an invalid identifier');
    if (reminderIds.has(r.id as string)) at('repeats an identifier used by another reminder');
    reminderIds.add(r.id as string);
    if (r.projectId !== null && (typeof r.projectId !== 'string' || !projectIds.has(r.projectId))) at('belongs to a project that is not in the backup');
    const problem = checkReminder({ projectId: r.projectId as string | null, title: r.title, text: r.text, dueDate: r.dueDate as string | null });
    if (problem) at(`is invalid: ${problem.message}`);
    if (!isStamp(r.createdAt) || !isStamp(r.updatedAt) || (r.completedAt !== null && !isStamp(r.completedAt))) at('has an unreadable timestamp');
  });
  return b as unknown as BackupFile;
}
