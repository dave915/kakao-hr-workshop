import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import type { LucideIcon } from "lucide-react";
import type { Page } from "../../shared/types";
import { advanceLiquidTab, targetLiquidTab } from "../lib/liquid-tab-motion";
import FilledNavigationIcon from "./FilledNavigationIcon";
import { liquidTabMotionTokens as tabMotion } from "../design/motion-tokens";

type Tab = { id: Page; short: string; icon: LucideIcon };
type Gesture = {
  id: number;
  x: number;
  y: number;
  dragging: boolean;
  tapIndex: number;
};

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
  const lens = useRef<HTMLSpanElement>(null);
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
    height: 54,
    center: 0,
    viewportWidth: 0,
  });
  const motion = useRef({
    x: 0,
    target: 0,
    velocity: 0,
    selectionScale: 1,
    sx: 1,
    sy: 1,
    lift: 0,
    liftVelocity: 0,
    frame: 0,
    time: 0,
  });

  function paint() {
    const nav = navRef.current,
      state = motion.current,
      bounds = geometry.current;
    if (!nav) return;
    const style = nav.style,
      magnification = 1 + state.lift * tabMotion.contentMagnification;
    style.setProperty("--ds-indicator-x", `${state.x}px`);
    style.setProperty("--ds-indicator-scale-x", `${state.sx}`);
    style.setProperty("--ds-indicator-scale-y", `${state.sy}`);
    style.setProperty("--ds-lens-reveal", `${state.lift}`);
    style.setProperty(
      "--ds-rail-scale",
      `${1 + state.lift * tabMotion.railExpansion}`,
    );
    style.setProperty("--ds-lens-counter-x", `${magnification / state.sx}`);
    style.setProperty("--ds-lens-counter-y", `${magnification / state.sy}`);
    style.setProperty(
      "--ds-lens-left",
      `${state.x + (bounds.step * (1 - state.sx)) / 2}px`,
    );
    style.setProperty(
      "--ds-lens-top",
      `${(bounds.height * (1 - state.sy)) / 2}px`,
    );
    style.setProperty("--ds-lens-width", `${bounds.step * state.sx}px`);
    style.setProperty("--ds-lens-height", `${bounds.height * state.sy}px`);
    style.setProperty(
      "--ds-lens-radius-x",
      `${(bounds.height * state.sx) / 2}px`,
    );
    if (state.lift > 0) nav.dataset.lensVisible = "true";
    else delete nav.dataset.lensVisible;
    if (lens.current && state.lift > 0) lens.current.hidden = false;
    if (!gesture.current && state.lift === 0 && activeRef.current < 0) {
      if (indicator.current) indicator.current.hidden = true;
      if (lens.current) lens.current.hidden = true;
    }
  }
  function tick(now: number) {
    const state = motion.current;
    state.frame = 0;
    const dt = (now - (state.time || now - 16)) / 1000;
    state.time = now;
    const moving = advanceLiquidTab(
      state,
      geometry.current,
      Boolean(gesture.current),
      reduced.current,
      dt,
      Boolean(gesture.current?.dragging),
    );
    paint();
    if (moving) state.frame = requestAnimationFrame(tick);
    else {
      state.time = 0;
      delete navRef.current?.dataset.animating;
    }
  }
  function animate() {
    const state = motion.current;
    if (navRef.current) navRef.current.dataset.animating = "true";
    if (!state.frame) {
      state.time = 0;
      state.frame = requestAnimationFrame(tick);
    }
  }
  function endGesture(restoreVisibility = true) {
    const current = gesture.current;
    gesture.current = null;
    if (current && navRef.current?.hasPointerCapture(current.id))
      navRef.current.releasePointerCapture(current.id);
    if (navRef.current) {
      delete navRef.current.dataset.dragging;
      delete navRef.current.dataset.pressed;
    }
    if (restoreVisibility) {
      if (indicator.current) indicator.current.hidden = activeRef.current < 0;
      if (lens.current)
        lens.current.hidden =
          activeRef.current < 0 && motion.current.lift === 0;
    }
  }
  function cancel() {
    if (!gesture.current) return;
    blockClick.current = true;
    endGesture();
    targetLiquidTab(
      motion.current,
      activeRef.current < 0
        ? motion.current.x
        : activeRef.current * geometry.current.step,
      geometry.current.step,
    );
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
      const scale =
        css.transform === "none" ? 1 : new DOMMatrixReadOnly(css.transform).a;
      const border = parseFloat(css.borderLeftWidth) || 0;
      const padding = parseFloat(css.paddingLeft) || 4;
      const left = box.left + (box.width - box.width / scale) / 2;
      const top = box.top + (box.height - box.height / scale) / 2;
      const step = Math.max(0, (nav.clientWidth - 2 * padding) / items.length);
      geometry.current = {
        left: left + border + padding,
        top,
        bottom: top + box.height / scale,
        step,
        padding,
        max: step * (items.length - 1),
        height: Math.max(0, nav.clientHeight - 2 * padding),
        center: box.left + box.width / 2,
        viewportWidth: window.innerWidth,
      };
      const state = motion.current;
      state.x = state.target = Math.max(0, activeRef.current) * step;
      state.velocity = 0;
      state.selectionScale = 1;
      state.sx = state.sy = 1;
      state.lift = state.liftVelocity = 0;
      nav.style.setProperty("--ds-tab-step", `${step}px`);
      const faces = nav.querySelectorAll<HTMLElement>(".ds-tab-face");
      faces.forEach((face) => {
        const rect = face.getBoundingClientRect();
        face.style.setProperty(
          "--ds-face-left",
          `${(rect.left - box.left) / scale - border - padding}px`,
        );
        face.style.setProperty(
          "--ds-face-top",
          `${(rect.top - box.top) / scale - border - padding}px`,
        );
      });
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
    targetLiquidTab(
      motion.current,
      Math.max(0, active) * geometry.current.step,
      geometry.current.step,
    );
    animate();
  }, [active]);

  function position(clientX: number) {
    const bounds = geometry.current;
    const x =
      bounds.center +
      (clientX - bounds.center) /
        (1 + motion.current.lift * tabMotion.railExpansion);
    return Math.max(0, Math.min(bounds.max, x - bounds.left - bounds.step / 2));
  }
  function down(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || event.button !== 0 || !geometry.current.step)
      return;
    blockClick.current = false;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      tapIndex: Number(
        (event.target as Element).closest<HTMLElement>("button.ds-tab")?.dataset
          .tabIndex ?? -1,
      ),
    };
    targetLiquidTab(
      motion.current,
      Math.round(position(event.clientX) / geometry.current.step) *
        geometry.current.step,
      geometry.current.step,
    );
    if (activeRef.current < 0) {
      motion.current.x = motion.current.target;
      motion.current.velocity = 0;
    }
    if (indicator.current) indicator.current.hidden = false;
    if (lens.current) lens.current.hidden = false;
    event.currentTarget.dataset.pressed = "true";
    animate();
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x,
      dy = event.clientY - current.y;
    const starting = !current.dragging;
    if (!current.dragging) {
      if (
        Math.abs(dy) > tabMotion.gesture.verticalCancelThresholdPx &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        cancel();
        return;
      }
      if (Math.abs(dx) < tabMotion.gesture.dragThresholdPx) return;
      current.dragging = true;
      motion.current.selectionScale = 1;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
      if (indicator.current) indicator.current.hidden = false;
      if (lens.current) lens.current.hidden = false;
    }
    const target = position(event.clientX);
    motion.current.target = target;
    if (starting && activeRef.current < 0) {
      motion.current.x = target;
      motion.current.velocity = 0;
    }
    animate();
  }
  function up(event: PointerEvent<HTMLElement>) {
    const current = gesture.current,
      bounds = geometry.current;
    if (!current || current.id !== event.pointerId) return;
    if (
      event.clientY < bounds.top - tabMotion.gesture.releaseOutsetPx ||
      event.clientY > bounds.bottom + tabMotion.gesture.releaseOutsetPx
    ) {
      cancel();
      return;
    }
    const index = current.dragging
      ? Math.round(position(event.clientX) / bounds.step)
      : current.tapIndex;
    if (
      index < 0 ||
      (!current.dragging &&
        Math.hypot(event.clientX - current.x, event.clientY - current.y) >
          tabMotion.gesture.tapTolerancePx)
    ) {
      cancel();
      return;
    }
    blockClick.current = true;
    endGesture(false);
    targetLiquidTab(motion.current, index * bounds.step, bounds.step);
    if (indicator.current) indicator.current.hidden = false;
    if (lens.current) lens.current.hidden = false;
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
      style={
        {
          "--ds-active-index": Math.max(0, active),
          "--ds-tab-count": items.length,
        } as CSSProperties
      }
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
      <span
        ref={lens}
        className="ds-tab-lens"
        aria-hidden="true"
        hidden={active < 0}
      >
        <span className="ds-tab-lens-content">
          {items.map((tab) => (
            <span key={tab.id} className="ds-tab-lens-item">
              <FilledNavigationIcon page={tab.id} fallback={tab.icon} />
              <span>{tab.short}</span>
            </span>
          ))}
        </span>
      </span>
      {items.map((tab, index) => (
        <button
          key={tab.id}
          className="ds-tab"
          data-tab-index={index}
          onClick={() => onNavigate(tab.id)}
          aria-current={page === tab.id ? "page" : undefined}
        >
          <span className="ds-tab-face">
            <span className="ds-tab-symbol" aria-hidden="true">
              <tab.icon
                className="ds-tab-outline"
                size={22}
                aria-hidden="true"
              />
              <FilledNavigationIcon
                className="ds-tab-filled"
                page={tab.id}
                fallback={tab.icon}
              />
            </span>
            <span>{tab.short}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
