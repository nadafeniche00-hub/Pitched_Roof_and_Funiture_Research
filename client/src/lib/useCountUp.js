import { useEffect, useRef, useState } from 'react';

/** A number that runs from where it was to its new value (the rings and bars of the results fill instead of jumping). Honours "reduce motion". */
export function useCountUp(target, ms = 700) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = target; setV(target); return undefined; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), cur = a + (target - a) * (1 - (1 - k) ** 3);
      from.current = cur; setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
