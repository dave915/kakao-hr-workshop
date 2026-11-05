import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const PULL_TO_ADD_THRESHOLD = 80;
const MAX_PULL = 112;
const SETTLE_DURATION = 300;
const OPEN_DURATION = 450;
type PullPhase = "idle" | "pulling" | "settling" | "opening";

/** Release directly into the sheet transition, without resetting the finger's final position. */
export function usePullToAdd(
  ref: RefObject<HTMLElement | null>,
  onAdd: () => void,
  disabled = false,
) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const callback = useRef(onAdd);
  const disabledRef = useRef(disabled);
  useLayoutEffect(() => {
    callback.current = onAdd;
    disabledRef.current = disabled;
  });
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
    const changePhase = (next: PullPhase) => {
      surface.dataset.pullPhase = next;
      setPhase(next);
    };
    draw(0);
    setReady(false);
    changePhase("idle");
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const reducedMotion = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settle = (opening = false) => {
      start = null;
      pulled = 0;
      setReady(opening);
      changePhase(opening ? "opening" : "settling");
      surface.style.setProperty(
        "--budget-pull-settle",
        `${opening ? OPEN_DURATION : SETTLE_DURATION}ms`,
      );
      locked = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      // Apply the transition phase before changing transform; the preceding frame
      // was finger tracking with transition:none. Never reset while still tracking.
      if (reducedMotion()) draw(0);
      else frame = requestAnimationFrame(() => draw(0));
      timer = setTimeout(
        () => {
          locked = false;
          setReady(false);
          changePhase("idle");
        },
        reducedMotion() ? 0 : opening ? OPEN_DURATION : SETTLE_DURATION,
      );
    };
    const begin = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        if (start) settle();
        return;
      }
      if (
        disabledRef.current ||
        locked ||
        surface.scrollTop > 0 ||
        (event.target instanceof Element &&
          event.target.closest(
            "button, a, input, select, textarea, [contenteditable]",
          ))
      )
        return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      changePhase("pulling");
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (
        disabledRef.current ||
        event.touches.length !== 1 ||
        surface.scrollTop > 0
      ) {
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
      settle(true);
      callback.current();
    };
    const cancel = () => settle();
    surface.addEventListener("touchstart", begin, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end);
    surface.addEventListener("touchcancel", cancel);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      surface.removeEventListener("touchstart", begin);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", cancel);
    };
  }, [ref]);
  return { ready, phase };
}
