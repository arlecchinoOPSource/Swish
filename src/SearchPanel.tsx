import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SearchField } from '@arlecchino/suite-ui';
import { formatDate, type Workspace } from './domain';
import { excerpt, highlightRanges, search, terms, type SearchResult } from './search';

export const RESULT_LIMIT = 50;

function Highlight({ text, queryTerms }: { text: string; queryTerms: string[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of highlightRanges(text, queryTerms)) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

const keyOf = (r: SearchResult) => r.kind === 'project' ? `p-${r.project.id}` : `r-${r.reminder.id}`;

type Props = { workspace: Workspace | null; query: string; onQuery: (query: string) => void; onOpen: (result: SearchResult) => void };

/**
 * Terminal-style search over project names and descriptions and reminder headers and
 * text: typing filters, Arrow/Home/End move the highlight, Enter or click opens.
 */
export function SearchPanel({ workspace, query, onQuery, onOpen }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlight, setHighlight] = useState(0);
  const queryTerms = useMemo(() => terms(query), [query]);
  const results = useMemo(() => workspace ? search(workspace, query) : [], [workspace, query]);
  const shown = results.slice(0, RESULT_LIMIT);
  const current = shown[Math.min(highlight, shown.length - 1)];
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (current) document.getElementById(`${id}-${keyOf(current)}`)?.scrollIntoView({ block: 'nearest' }); }, [id, current]);

  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); if (current) onOpen(current); return; }
    const index = current ? shown.indexOf(current) : 0;
    const next = ({ ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: shown.length - 1 } as Record<string, number>)[event.key];
    if (next === undefined || !shown.length) return;
    event.preventDefault();
    setHighlight(Math.max(0, Math.min(shown.length - 1, next)));
  }

  const trimmed = query.trim();
  const message = !workspace ? 'SEARCH OPENS ONCE LOCAL DATA IS READY.'
    : queryTerms.length === 0 ? 'Type to search projects and reminders.'
    : results.length === 0 ? `No matches for “${trimmed}”.`
    : results.length > RESULT_LIMIT ? `FIRST ${RESULT_LIMIT} OF ${results.length} MATCHES · ADD A WORD TO NARROW`
    : `${results.length} ${results.length === 1 ? 'MATCH' : 'MATCHES'} · ENTER TO OPEN`;

  return <>
    <SearchField ref={inputRef} label="Search projects and reminders" placeholder="Search projects and reminders" disabled={!workspace}
      role="combobox" aria-expanded={shown.length > 0} aria-controls={`${id}-results`} aria-autocomplete="list"
      aria-activedescendant={current ? `${id}-${keyOf(current)}` : undefined} aria-describedby={`${id}-message`}
      value={query} onChange={e => { onQuery(e.target.value); setHighlight(0); }} onKeyDown={keys} />
    <p id={`${id}-message`} className="search-message" role="status">{message}</p>
    {shown.length > 0 && <ul id={`${id}-results`} className="archive-list search-results swish-results" role="listbox" aria-label="Search results">
      {shown.map(result => <li key={keyOf(result)} id={`${id}-${keyOf(result)}`} role="option" aria-selected={result === current}
        className="archive-row" onPointerDown={e => e.preventDefault()} onClick={() => onOpen(result)}>
        <span className="archive-marker" aria-hidden="true">{result === current ? '▶' : ''}</span>
        {result.kind === 'project'
          ? <span className="result-body">
              <span className="archive-title"><Highlight text={result.project.name} queryTerms={queryTerms} /></span>
              {result.field === 'description' && <span className="result-snippet"><Highlight text={excerpt(result.project.description, queryTerms).text} queryTerms={queryTerms} /></span>}
              <span className="archive-meta">Deadline {formatDate(result.project.deadline)}</span>
            </span>
          : <span className="result-body">
              <span className="archive-title"><Highlight text={result.reminder.title} queryTerms={queryTerms} /></span>
              {result.field === 'text' && <span className="result-snippet"><Highlight text={excerpt(result.reminder.text, queryTerms).text} queryTerms={queryTerms} /></span>}
              <span className="archive-meta">{result.project ? `In project ${result.project.name}` : 'In Regular Reminders'}</span>
            </span>}
        <span className="archive-meta result-kind">{result.kind === 'project' ? 'PROJECT' : result.reminder.completedAt ? '✓ DONE' : 'REMINDER'}</span>
      </li>)}
    </ul>}
  </>;
}
