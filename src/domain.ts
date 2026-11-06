/** Mirrors swish-data's serialized model. Dates are date-only `YYYY-MM-DD` strings. */
export type Project = { id: string; name: string; description: string; deadline: string; createdAt: string; updatedAt: string };
/** One model for both contexts: `projectId: null` is a regular reminder. */
export type Reminder = { id: string; projectId: string | null; title: string; text: string; dueDate: string | null; completedAt: string | null; createdAt: string; updatedAt: string };
export type Workspace = { projects: Project[]; reminders: Reminder[] };

export type Field = 'id' | 'name' | 'description' | 'deadline' | 'projectId' | 'title' | 'text' | 'dueDate';
export type StorageError = { code: 'invalid' | 'notFound' | 'schemaTooNew' | 'foreignDatabase' | 'storage' | 'unavailable'; field?: Field; message: string };

export function isStorageError(value: unknown): value is StorageError {
  return typeof value === 'object' && value !== null && typeof (value as StorageError).code === 'string' && typeof (value as StorageError).message === 'string';
}

/** Normalizes anything thrown by an adapter into a displayable error. */
export function toStorageError(value: unknown): StorageError {
  return isStorageError(value) ? value : { code: 'storage', message: 'Swish could not reach its local data file. Nothing was changed.' };
}

/** Formats a date-only value in the viewer's locale without converting through UTC. */
export function formatDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
