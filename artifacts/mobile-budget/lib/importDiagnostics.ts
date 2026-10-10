import { useEffect, useLayoutEffect, useRef } from 'react';
import { customFetch } from '@workspace/api-client-react';

/**
 * What the Import M-Pesa page is doing, told to the server while it is open
 * (10 Oct 2026: "the page is still stale" - it would not answer a tap, and
 * nothing on this phone could say why). Every 2 seconds: how many times it
 * drew, its slowest draw, and how late the 2-second timer fired - a timer
 * many seconds late means the app itself was stuck. Taps are noted as they
 * arrive, so a tap that never reaches the app shows by its absence.
 *
 * Sent as the query of the server's health check, which logs every request
 * it answers: nothing new on the server, and no names, amounts or messages -
 * only counts and milliseconds. Stops after a minute.
 */
const EVERY_MS = 2000;
const TICKS = 30;

const send = (what: string) => {
  void customFetch(`/api/healthz?import=${encodeURIComponent(what)}`).catch(() => {});
};

export function useImportDiagnostics(lines: number): (what: string) => void {
  const stats = useRef({ renders: 0, longest: 0, lines: 0 });
  stats.current.renders += 1;
  stats.current.lines = lines;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  useLayoutEffect(() => {
    const took = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    if (took > stats.current.longest) stats.current.longest = took;
  });
  useEffect(() => {
    const opened = Date.now();
    let last = opened;
    let ticks = 0;
    send('open');
    const timer = setInterval(() => {
      const now = Date.now();
      const late = now - last - EVERY_MS;
      last = now;
      const { renders, longest, lines: count } = stats.current;
      send(`t${Math.round((now - opened) / 1000)}s draws${renders} slowest${Math.round(longest)}ms late${late}ms lines${count}`);
      stats.current.renders = 0;
      stats.current.longest = 0;
      ticks += 1;
      if (ticks >= TICKS) clearInterval(timer);
    }, EVERY_MS);
    return () => {
      clearInterval(timer);
      send(`close after ${Math.round((Date.now() - opened) / 1000)}s`);
    };
  }, []);
  return send;
}
