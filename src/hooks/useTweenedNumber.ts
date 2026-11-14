import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tweens a numeric readout smoothly when target changes, respecting prefers-reduced-motion.
 */
export function useTweenedNumber(target: number, durationMs: number = 180): number {
  const [displayValue, setDisplayValue] = useState<number>(target);
  const currentRef = useRef<number>(target);

  useEffect(() => {
    if (prefersReducedMotion() || durationMs <= 0) {
      currentRef.current = target;
      setDisplayValue(target);
      return;
    }

    const from = currentRef.current;
    if (Math.abs(target - from) < 1e-4) {
      currentRef.current = target;
      setDisplayValue(target);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      currentRef.current = next;
      setDisplayValue(next);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        currentRef.current = target;
        setDisplayValue(target);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, durationMs]);

  return displayValue;
}
