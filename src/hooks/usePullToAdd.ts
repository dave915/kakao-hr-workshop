import { useEffect, useRef, useState, type RefObject } from "react";

export const PULL_TO_ADD_THRESHOLD = 64;

/** Own only a downward, single-finger pull that starts at the scroll surface's top. */
export function usePullToAdd(
  ref: RefObject<HTMLElement | null>,
  onAdd: () => void,
  disabled = false,
) {
  const [distance, setDistance] = useState(0);
  const callback = useRef(onAdd);
  callback.current = onAdd;
  useEffect(() => {
    const surface = ref.current;
    if (!surface || disabled) return;
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    const reset = () => {
      start = null;
      pulled = 0;
      setDistance(0);
    };
    const begin = (event: TouchEvent) => {
      reset();
      if (
        event.touches.length !== 1 ||
        surface.scrollTop > 0 ||
        (event.target instanceof Element &&
          event.target.closest(
            "button, a, input, select, textarea, [contenteditable]",
          ))
      )
        return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || surface.scrollTop > 0) {
        reset();
        return;
      }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (dy < 0 || Math.abs(dx) > Math.max(12, dy)) {
        reset();
        return;
      }
      if (dy < 8) return;
      if (!event.cancelable) {
        reset();
        return;
      }
      event.preventDefault();
      pulled = Math.min(100, dy * 0.55);
      setDistance(pulled);
    };
    const end = () => {
      const ready = pulled >= PULL_TO_ADD_THRESHOLD;
      reset();
      if (ready) callback.current();
    };
    surface.addEventListener("touchstart", begin, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end);
    surface.addEventListener("touchcancel", reset);
    return () => {
      surface.removeEventListener("touchstart", begin);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", reset);
      reset();
    };
  }, [ref, disabled]);
  return { distance, ready: distance >= PULL_TO_ADD_THRESHOLD };
}
