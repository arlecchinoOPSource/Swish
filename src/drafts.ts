import type { ProjectInput, ReminderInput } from './domain';

/**
 * Unsaved form contents kept on this device so a crash, restart, or switching to
 * another form never loses typing. Drafts are a recovery buffer only; projects and
 * reminders live in SQLite. Every access tolerates unavailable storage.
 */
export type DraftTarget =
  | { kind: 'new-project' }
  | { kind: 'project'; id: string }
  | { kind: 'new-reminder'; projectId: string | null }
  | { kind: 'reminder'; id: string };
export type Draft =
  | { key: string; target: Extract<DraftTarget, { kind: 'new-project' | 'project' }>; values: ProjectInput; label: string; savedAt: string }
  | { key: string; target: Extract<DraftTarget, { kind: 'new-reminder' | 'reminder' }>; values: ReminderInput; label: string; savedAt: string };

export const DRAFTS_KEY = 'swish.drafts.v1';

export function draftKey(target: DraftTarget): string {
  switch (target.kind) {
    case 'new-project': return 'new-project';
    case 'project': return `project:${target.id}`;
    case 'new-reminder': return `new-reminder:${target.projectId ?? 'regular'}`;
    case 'reminder': return `reminder:${target.id}`;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string';
const isNullableText = (v: unknown): v is string | null => v === null || isText(v);

/** Drops anything malformed rather than trusting what is on disk. */
function valid(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  const t = d.target as Record<string, unknown> | undefined;
  const v = d.values as Record<string, unknown> | undefined;
  if (!isText(d.key) || !isText(d.label) || !isText(d.savedAt) || !t || !v || !isText(t.kind)) return false;
  if (t.kind === 'new-project' || t.kind === 'project') return (t.kind === 'new-project' || isText(t.id)) && isText(v.name) && isText(v.description) && isText(v.deadline);
  if (t.kind === 'new-reminder' || t.kind === 'reminder') return (t.kind === 'reminder' ? isText(t.id) : isNullableText(t.projectId)) && isNullableText(v.projectId) && isText(v.title) && isText(v.text) && isNullableText(v.dueDate);
  return false;
}

export function loadDrafts(): Draft[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(valid).filter(d => draftKey(d.target) === d.key) : [];
  } catch { return []; }
}

/** Returns false if the draft could not be kept (storage full or unavailable). */
export function storeDrafts(drafts: Draft[]): boolean {
  try {
    if (drafts.length === 0) localStorage.removeItem(DRAFTS_KEY);
    else localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    return true;
  } catch { return false; }
}
