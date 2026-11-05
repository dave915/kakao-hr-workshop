import { useEffect, useRef, useState, type RefObject } from "react";

export const PULL_TO_ADD_THRESHOLD = 80;
const MAX_PULL = 112;
const COMMIT_DELAY = 160;
const SETTLE_DURATION = 300;
type PullPhase = "idle" | "pulling" | "settling" | "opening";

/** Track the finger with transforms; acknowledge release before opening the editor. */
export function usePullToAdd(
  ref: RefObject<HTMLElement | null>,
  onAdd: () => void,
  disabled = false,
) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const callback = useRef(onAdd);
  callback.current = onAdd;
  useEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    const draw = (distance: number) => {
      surface.style.setProperty("--budget-pull-distance", `${distance}px`);
      surface.style.setProperty(
        "--budget-pull-progress",
        String(Math.min(1, distance / PULL_TO_ADD_THRESHOLD)),
      );
    };
    draw(0);
    setReady(false);
    setPhase("idle");
    if (disabled) return;
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reducedMotion = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settle = () => {
      start = null;
      pulled = 0;
      setReady(false);
      setPhase("settling");
      draw(0);
      locked = true;
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          locked = false;
          setPhase("idle");
        },
        reducedMotion() ? 0 : SETTLE_DURATION,
      );
    };
    const begin = (event: TouchEvent) => {
      if (
        locked ||
        event.touches.length !== 1 ||
        surface.scrollTop > 0 ||
        (event.target instanceof Element &&
          event.target.closest(
            "button, a, input, select, textarea, [contenteditable]",
          ))
      )
        return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      setPhase("pulling");
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || surface.scrollTop > 0) {
        settle();
        return;
      }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (dy < 0 || Math.abs(dx) > Math.max(12, dy)) {
        settle();
        return;
      }
      if (dy < 8) return;
      if (!event.cancelable) {
        settle();
        return;
      }
      event.preventDefault();
      pulled = Math.min(MAX_PULL, dy * 0.55);
      draw(pulled);
      setReady(pulled >= PULL_TO_ADD_THRESHOLD);
    };
    const end = () => {
      if (!start) return;
      start = null;
      if (pulled < PULL_TO_ADD_THRESHOLD) {
        settle();
        return;
      }
      locked = true;
      setPhase("opening");
      draw(PULL_TO_ADD_THRESHOLD);
      timer = setTimeout(
        () => {
          settle();
          callback.current();
        },
        reducedMotion() ? 0 : COMMIT_DELAY,
      );
    };
    surface.addEventListener("touchstart", begin, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end);
    surface.addEventListener("touchcancel", settle);
    return () => {
      clearTimeout(timer);
      surface.removeEventListener("touchstart", begin);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", settle);
    };
  }, [ref, disabled]);
  return { ready, phase };
}
