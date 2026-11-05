import { useEffect, useLayoutEffect, useRef } from "react";
import { createMobileMenuSwipe } from "../lib/mobile-menu-swipe";

const point = (touch: Touch) => ({
  id: touch.identifier,
  x: touch.clientX,
  y: touch.clientY,
});

export function useMobileMenuSwipe(enabled: boolean, onOpen: () => void) {
  const callback = useRef(onOpen);
  useLayoutEffect(() => {
    callback.current = onOpen;
  });
  useEffect(() => {
    if (!enabled) return;
    const surface = document.querySelector<HTMLElement>(".main-shell");
    if (!surface) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const gesture = createMobileMenuSwipe();
    const available = () =>
      mobile.matches &&
      !document.querySelector('dialog[open], [aria-modal="true"]') &&
      !document.hidden;
    const selectable = () => Boolean(window.getSelection()?.toString());
    const ownsGesture = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !surface.contains(target))
        return false;
      if (
        target.closest(
          'input, select, textarea, [contenteditable], [role="slider"], [role="menu"], video, audio, canvas, [data-swipe-row][data-open="true"], [data-menu-swipe="ignore"]',
        )
      )
        return false;
      for (
        let node: Element | null = target;
        node && node !== surface;
        node = node.parentElement
      ) {
        if (
          node.scrollWidth > node.clientWidth + 1 &&
          /^(auto|scroll)$/.test(getComputedStyle(node).overflowX)
        )
          return false;
      }
      return true;
    };
    const begin = (event: TouchEvent) => {
      gesture.cancel();
      if (
        event.touches.length !== 1 ||
        !available() ||
        selectable() ||
        !ownsGesture(event.target)
      )
        return;
      const touch = event.touches[0];
      // Keep the browser's edge-back gesture available; swiping the page body opens our menu.
      if (touch.clientX < 20) return;
      gesture.begin(point(touch));
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !available() || selectable()) {
        gesture.cancel();
        return;
      }
      if (!gesture.move(point(event.touches[0]))) return;
      if (!event.cancelable) {
        gesture.cancel();
        return;
      }
      event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      if (
        event.touches.length ||
        event.changedTouches.length !== 1 ||
        !available() ||
        selectable()
      ) {
        gesture.cancel();
        return;
      }
      if (!gesture.end(point(event.changedTouches[0]))) return;
      // Suppress the release click so it cannot immediately hit the new backdrop.
      if (event.cancelable) event.preventDefault();
      callback.current();
    };
    const cancel = () => gesture.cancel();
    surface.addEventListener("touchstart", begin, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end, { passive: false });
    surface.addEventListener("touchcancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("hashchange", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      gesture.cancel();
      surface.removeEventListener("touchstart", begin);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("hashchange", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  }, [enabled]);
}
