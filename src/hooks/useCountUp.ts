import { useEffect, useRef, useState } from "react";

/**
 * Menganimasikan perubahan angka supaya update data terlihat mengalir, bukan meloncat.
 * Dipakai untuk kartu statistik dan papan monitoring.
 */
export function useCountUp(value: number, duration = 900) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(value) ? value : 0;

    if (from === to) {
      currentRef.current = to;
      setDisplay(to);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (to - from) * eased;

      currentRef.current = next;
      setDisplay(next);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = currentRef.current;
    };
  }, [value, duration]);

  return display;
}
