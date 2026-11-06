import { useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
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

type Props = { workspace: Workspace | null; query: string; onQuery: (query: string) => void; onOpen: (result: SearchResult) => void };

/** Searches project names/descriptions and reminder headers/text in the loaded canvas. */
export function SearchPanel({ workspace, query, onQuery, onOpen }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const queryTerms = useMemo(() => terms(query), [query]);
  const results = useMemo(() => workspace ? search(workspace, query) : [], [workspace, query]);
  const shown = results.slice(0, RESULT_LIMIT);

  function move(event: KeyboardEvent, from: number) {
    const buttons = [...(list.current?.querySelectorAll('button') ?? [])];
    const next = event.key === 'ArrowDown' ? from + 1 : event.key === 'ArrowUp' ? from - 1 : null;
    if (next === null) return;
    event.preventDefault();
    if (next < 0) input.current?.focus();
    else buttons[Math.min(next, buttons.length - 1)]?.focus();
  }

  const summary = !workspace ? 'Search is available once local data has opened.'
    : queryTerms.length === 0 ? 'Type to search project names and descriptions, and reminder headers and text.'
    : results.length === 0 ? `No matches for “${query.trim()}”.`
    : results.length > RESULT_LIMIT ? `Showing the first ${RESULT_LIMIT} of ${results.length} matches. Add a word to narrow it down.`
    : `${results.length} match${results.length === 1 ? '' : 'es'}.`;

  return <div className="search-panel">
    <label htmlFor={`${id}-q`}>Search projects and reminders</label>
    <div className="date-row">
      <input id={`${id}-q`} ref={input} className="suite-input" type="search" autoFocus value={query} placeholder="Project, header, or text"
        aria-describedby={`${id}-summary`} aria-controls={`${id}-results`} disabled={!workspace}
        onChange={e => onQuery(e.target.value)} onKeyDown={e => move(e, -1)} />
      {query && <button type="button" className="suite-button" onClick={() => { onQuery(''); input.current?.focus(); }}>Clear</button>}
    </div>
    <p id={`${id}-summary`} className="search-summary" role="status">{summary}</p>
    {shown.length > 0 && <ul id={`${id}-results`} ref={list} className="search-results" aria-label="Search results">
      {shown.map((result, index) => <li key={result.kind === 'project' ? `p-${result.project.id}` : `r-${result.reminder.id}`}>
        <button type="button" className="search-result" onKeyDown={e => move(e, index)} onClick={() => onOpen(result)}>
          {result.kind === 'project' ? <>
            <span className="result-kind">Project</span>
            <span className="result-title"><Highlight text={result.project.name} queryTerms={queryTerms} /></span>
            <span className="result-context">Deadline {formatDate(result.project.deadline)}</span>
            {result.field === 'description' && <span className="result-snippet"><Highlight text={excerpt(result.project.description, queryTerms).text} queryTerms={queryTerms} /></span>}
          </> : <>
            <span className="result-kind">Reminder{result.reminder.completedAt ? ' · ✓ Completed' : ''}</span>
            <span className="result-title"><Highlight text={result.reminder.title} queryTerms={queryTerms} /></span>
            <span className="result-context">{result.project ? `In project ${result.project.name}` : 'In Regular Reminders'}</span>
            {result.field === 'text' && <span className="result-snippet"><Highlight text={excerpt(result.reminder.text, queryTerms).text} queryTerms={queryTerms} /></span>}
          </>}
        </button>
      </li>)}
    </ul>}
  </div>;
}
