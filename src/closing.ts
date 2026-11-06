import { useEffect, useRef } from 'react';
import { sounds } from './sounds';

/**
 * Native close (desktop app only), following Terminal: the host stops the window from
 * closing and asks the page; the page waits for queued saves, starts the close sound,
 * and the host hides the window and exits when the sound has finished. Closing never
 * waits on the sound itself, and every step has a bounded fallback.
 */
export function useNativeClose(flush: () => Promise<void>) {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | undefined;
    let closing = false;
    let cancelled = false;
    void (async () => {
      const [{ listen }, { invoke }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')]);
      const stop = await listen('swish-close-requested', () => {
        if (closing) return;
        closing = true;
        const settle = <T,>(work: Promise<T>, ms: number, fallback: T) => Promise.race([work, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);
        void (async () => {
          // Saves always commit before the window goes; a stuck save cannot hold it open forever.
          await settle(latest.current(), 5000, undefined);
          const lingerMs = await settle(sounds.playClose(), 1000, 0);
          await invoke('finish_exit', { lingerMs });
        })().catch(() => invoke('finish_exit', { lingerMs: 0 }));
      });
      if (cancelled) stop(); else unlisten = stop;
    })();
    return () => { cancelled = true; unlisten?.(); };
  }, []);
}
