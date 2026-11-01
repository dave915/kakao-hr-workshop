import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import type { LucideIcon } from "lucide-react";
import type { Page } from "../../shared/types";

type Tab = { id: Page; short: string; icon: LucideIcon };
type Gesture = { id: number; x: number; y: number; dragging: boolean };

/** A single glass selection follows the finger; navigation commits on release. */
export default function MobileTabBar({
  items,
  page,
  onNavigate,
  navRef,
}: {
  items: readonly Tab[];
  page: Page;
  onNavigate: (page: Page) => void;
  navRef: RefObject<HTMLElement | null>;
}) {
  const active = items.findIndex((item) => item.id === page);
  const activeRef = useRef(active);
  activeRef.current = active;
  const indicator = useRef<HTMLSpanElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const blockClick = useRef(false);
  const reduced = useRef(false);
  const geometry = useRef({
    left: 0,
    top: 0,
    bottom: 0,
    step: 0,
    padding: 4,
    max: 0,
  });
  const motion = useRef({
    x: 0,
    target: 0,
    velocity: 0,
    sx: 1,
    sy: 1,
    y: 0,
    frame: 0,
    time: 0,
  });

  function paint() {
    const node = indicator.current,
      state = motion.current;
    if (!node) return;
    node.style.setProperty("--ds-indicator-x", `${state.x}px`);
    node.style.setProperty("--ds-indicator-scale-x", `${state.sx}`);
    node.style.setProperty("--ds-indicator-scale-y", `${state.sy}`);
    node.style.setProperty("--ds-indicator-y", `${state.y}px`);
  }
  function tick(now: number) {
    const state = motion.current,
      bounds = geometry.current;
    state.frame = 0;
    const dt = Math.min(0.032, (now - (state.time || now - 16)) / 1000);
    state.time = now;
    const dragging = gesture.current?.dragging === true;
    if (reduced.current) {
      state.x = state.target;
      state.velocity = 0;
      state.sx = state.sy = 1;
      state.y = 0;
    } else {
      const steps = Math.max(1, Math.ceil(dt * 120)),
        h = dt / steps;
      for (let n = 0; n < steps; n++) {
        state.velocity +=
          ((state.target - state.x) * (dragging ? 700 : 360) -
            state.velocity * (dragging ? 40 : 30)) *
          h;
        state.x += state.velocity * h;
      }
      if (state.x < 0 || state.x > bounds.max) {
        state.x = Math.max(0, Math.min(bounds.max, state.x));
        state.velocity = 0;
      }
      const room = Math.max(
        0,
        Math.min(state.x, bounds.max - state.x) + bounds.padding - 1,
      );
      const stretch = Math.min(
        (dragging ? 0.045 : 0) + Math.abs(state.velocity) / 2400,
        0.24,
        (2 * room) / (bounds.step || 1),
      );
      const ease = 1 - Math.exp(-24 * dt);
      state.sx += (1 + stretch - state.sx) * ease;
      state.sy +=
        (1 + (dragging ? 0.035 : 0) - stretch * 0.48 - state.sy) * ease;
      state.y += ((dragging ? -1 : 0) - state.y) * ease;
    }
    const moving =
      Math.abs(state.x - state.target) > 0.08 ||
      Math.abs(state.velocity) > 1 ||
      Math.abs(state.sx - 1) > 0.001 ||
      Math.abs(state.sy - 1) > 0.001 ||
      Math.abs(state.y) > 0.01;
    if (!dragging && !moving) {
      state.x = state.target;
      state.velocity = 0;
      state.sx = state.sy = 1;
      state.y = 0;
      delete navRef.current?.dataset.animating;
    }
    paint();
    if (!reduced.current && (moving || dragging))
      state.frame = requestAnimationFrame(tick);
    else state.time = 0;
  }
  function animate() {
    const state = motion.current;
    if (navRef.current) navRef.current.dataset.animating = "true";
    if (!state.frame) {
      state.time = 0;
      state.frame = requestAnimationFrame(tick);
    }
  }
  function preview(index: number) {
    navRef.current
      ?.querySelectorAll<HTMLElement>(".ds-tab")
      .forEach((tab, i) => {
        if (i === index) tab.dataset.preview = "true";
        else delete tab.dataset.preview;
      });
  }
  function endGesture() {
    const current = gesture.current;
    gesture.current = null;
    if (current && navRef.current?.hasPointerCapture(current.id))
      navRef.current.releasePointerCapture(current.id);
    if (navRef.current) delete navRef.current.dataset.dragging;
    preview(-1);
    if (indicator.current) indicator.current.hidden = activeRef.current < 0;
  }
  function cancel() {
    if (!gesture.current) return;
    blockClick.current = true;
    endGesture();
    motion.current.target =
      Math.max(0, activeRef.current) * geometry.current.step;
    animate();
  }
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const changePreference = () => {
      reduced.current = preference.matches;
      animate();
    };
    reduced.current = preference.matches;
    const measure = () => {
      cancel();
      const box = nav.getBoundingClientRect(),
        css = getComputedStyle(nav);
      const padding = parseFloat(css.paddingLeft) || 4;
      const step = Math.max(0, (nav.clientWidth - 2 * padding) / items.length);
      geometry.current = {
        left: box.left + (parseFloat(css.borderLeftWidth) || 0) + padding,
        top: box.top,
        bottom: box.bottom,
        step,
        padding,
        max: step * (items.length - 1),
      };
      const state = motion.current;
      state.x = state.target = Math.max(0, activeRef.current) * step;
      state.velocity = 0;
      state.sx = state.sy = 1;
      state.y = 0;
      paint();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const escape = (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && !gesture.current)
        blockClick.current = false;
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        cancel();
      }
    };
    preference.addEventListener("change", changePreference);
    window.addEventListener("resize", measure);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      endGesture();
      cancelAnimationFrame(motion.current.frame);
      motion.current.frame = 0;
      observer.disconnect();
      preference.removeEventListener("change", changePreference);
      window.removeEventListener("resize", measure);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [navRef, items.length]);
  useLayoutEffect(() => {
    endGesture();
    motion.current.target = Math.max(0, active) * geometry.current.step;
    animate();
  }, [active]);

  function down(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || event.button !== 0 || !geometry.current.step)
      return;
    blockClick.current = false;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current,
      bounds = geometry.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x,
      dy = event.clientY - current.y;
    const starting = !current.dragging;
    if (!current.dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        cancel();
        return;
      }
      if (Math.abs(dx) < 6) return;
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
      if (indicator.current) indicator.current.hidden = false;
    }
    const position = Math.max(
      0,
      Math.min(bounds.max, event.clientX - bounds.left - bounds.step / 2),
    );
    motion.current.target = position;
    if (starting && activeRef.current < 0) {
      motion.current.x = position;
      motion.current.velocity = 0;
    }
    preview(Math.round(position / bounds.step));
    animate();
  }
  function up(event: PointerEvent<HTMLElement>) {
    const current = gesture.current,
      bounds = geometry.current;
    if (!current || current.id !== event.pointerId) return;
    if (!current.dragging) {
      gesture.current = null;
      return;
    }
    if (event.clientY < bounds.top - 44 || event.clientY > bounds.bottom + 44) {
      cancel();
      return;
    }
    const index = Math.max(
      0,
      Math.min(
        items.length - 1,
        Math.round(
          (event.clientX - bounds.left - bounds.step / 2) / bounds.step,
        ),
      ),
    );
    blockClick.current = true;
    endGesture();
    motion.current.target = index * bounds.step;
    if (indicator.current) indicator.current.hidden = false;
    animate();
    onNavigate(items[index].id);
  }

  return (
    <nav
      ref={navRef}
      className="bottom-nav ds-tabbar ds-tabbar--fixed ds-glass"
      aria-label="모바일 메뉴"
      data-indicator="true"
      data-draggable="true"
      style={{ "--ds-active-index": Math.max(0, active) } as CSSProperties}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
      onPointerLeave={() => {
        if (gesture.current && !gesture.current.dragging) cancel();
      }}
      onClickCapture={(event) => {
        // Consume the click that follows a drag or cancellation. New pointer
        // presses and explicit keyboard activation start a fresh interaction.
        if (blockClick.current) {
          event.preventDefault();
          event.stopPropagation();
          blockClick.current = false;
        }
      }}
    >
      <span
        ref={indicator}
        className="ds-tab-indicator"
        aria-hidden="true"
        hidden={active < 0}
      />
      {items.map((tab) => (
        <button
          key={tab.id}
          className="ds-tab"
          onClick={() => onNavigate(tab.id)}
          aria-current={page === tab.id ? "page" : undefined}
        >
          <tab.icon size={22} aria-hidden="true" />
          <span>{tab.short}</span>
        </button>
      ))}
    </nav>
  );
}
