import { useEffect, useState } from 'react';

/** The viewer's local calendar date as YYYY-MM-DD. Never derived through UTC. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Today's local date, refreshed just after local midnight and whenever the window
 * becomes visible or focused again (sleep, time-zone changes, clock changes).
 */
export function useToday(): string {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const refresh = () => setToday(localToday());
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [today]);
  return today;
}

export type DueState = 'overdue' | 'today' | 'upcoming';

/** Date-only comparison: YYYY-MM-DD strings sort chronologically. */
export function dueState(date: string, today: string): DueState {
  return date < today ? 'overdue' : date === today ? 'today' : 'upcoming';
}
