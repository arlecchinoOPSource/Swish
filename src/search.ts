import type { Project, Reminder, Workspace } from './domain';

/**
 * Search normalization: compatibility decomposition, combining marks removed,
 * lowercase, whitespace collapsed. "Café", "CAFE", and "ｃａｆｅ" all match "cafe".
 * Each normalized character keeps the index of the original character it came from,
 * so matches can be highlighted in the text exactly as the user wrote it.
 */
export function normalizeWithMap(value: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  let index = 0;
  let space = false;
  for (const char of value) {
    const folded = char.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    for (const piece of folded) {
      if (/\s/u.test(piece)) {
        if (!space && text.length > 0) { text += ' '; map.push(index); }
        space = true;
      } else {
        // One map entry per UTF-16 unit, matching how indexOf counts.
        text += piece; for (let unit = 0; unit < piece.length; unit++) map.push(index); space = false;
      }
    }
    index += char.length;
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop(); }
  return { text, map };
}

export const normalize = (value: string) => normalizeWithMap(value).text;

export function terms(query: string): string[] {
  return [...new Set(normalize(query).split(' ').filter(Boolean))];
}

/** Original-text ranges [start, end) covered by any term, merged and sorted. */
export function highlightRanges(value: string, queryTerms: string[]): [number, number][] {
  const { text, map } = normalizeWithMap(value);
  const ranges: [number, number][] = [];
  for (const term of queryTerms) {
    for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) {
      const start = map[at];
      const lastOriginal = map[at + term.length - 1];
      // End after the whole original character (surrogate pairs included).
      const end = lastOriginal + ([...value.slice(lastOriginal)][0]?.length ?? 1);
      ranges.push([start, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export type SearchResult =
  | { kind: 'project'; project: Project; field: 'name' | 'description' }
  | { kind: 'reminder'; reminder: Reminder; project: Project | null; field: 'title' | 'text' };

const contains = (value: string, queryTerms: string[]) => { const text = normalize(value); return queryTerms.every(t => text.includes(t)); };

/**
 * Every term must appear in the same item: a project's name and description, or a
 * reminder's header and text. Title matches rank before body matches; projects first.
 */
export function search(workspace: Workspace, query: string): SearchResult[] {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) return [];
  const byId = new Map(workspace.projects.map(p => [p.id, p]));
  const projects: SearchResult[] = workspace.projects
    .filter(p => contains(`${p.name} ${p.description}`, queryTerms))
    .map(p => ({ kind: 'project', project: p, field: contains(p.name, queryTerms) ? 'name' : 'description' }));
  const reminders: SearchResult[] = workspace.reminders
    .filter(r => contains(`${r.title} ${r.text}`, queryTerms))
    .map(r => ({ kind: 'reminder', reminder: r, project: r.projectId ? byId.get(r.projectId) ?? null : null, field: contains(r.title, queryTerms) ? 'title' : 'text' }));
  const rank = (r: SearchResult) => (r.field === 'name' || r.field === 'title' ? 0 : 1);
  return [...projects.sort((a, b) => rank(a) - rank(b)), ...reminders.sort((a, b) => rank(a) - rank(b))];
}

/** A short excerpt of `value` around the first match, for body-text results. */
export function excerpt(value: string, queryTerms: string[], radius = 48): { text: string; offset: number } {
  const first = highlightRanges(value, queryTerms)[0];
  if (!first || value.length <= radius * 2) return { text: value, offset: 0 };
  const start = Math.max(0, first[0] - radius);
  const end = Math.min(value.length, first[1] + radius);
  return { text: `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`, offset: start > 0 ? start - 1 : 0 };
}
