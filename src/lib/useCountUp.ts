import { useEffect, useRef, useState } from 'react';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Zählt sanft auf einen Zielwert hoch (beim ersten Anzeigen und bei Änderungen). */
export function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(value);

  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = begin + (target - begin) * eased;
      setValue(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/** true ab dem ersten Frame nach dem Einblenden; für einmalige Einblend-Übergänge. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}
