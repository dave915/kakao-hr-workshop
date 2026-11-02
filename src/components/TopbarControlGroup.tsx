import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Page } from "../../shared/types";

/** One selection surface moves between the topbar's differently sized buttons. */
export default function TopbarControlGroup({
  page,
  children,
}: {
  page: Page;
  children: ReactNode;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);

  const update = useCallback((animate: boolean) => {
    const group = groupRef.current;
    const indicator = indicatorRef.current;
    if (!group || !indicator) return;

    const target = group.querySelector<HTMLElement>('[aria-current="page"]');
    // Read the in-flight visual position before cancelling, so rapid taps reverse
    // from where the surface actually is, rather than its previous destination.
    const previous = indicator.getBoundingClientRect();
    const opacity = Number(getComputedStyle(indicator).opacity);
    const origin = group.getBoundingClientRect();
    const tokens = getComputedStyle(group);
    const ready = group.dataset.indicatorReady === "true";
    const duration = parseFloat(
      tokens.getPropertyValue(
        !target
          ? "--ds-duration-fast"
          : opacity > 0
            ? "--ds-duration-selection"
            : "--ds-duration-normal",
      ),
    );
    const easing = tokens.getPropertyValue("--ds-ease-standard").trim();
    let from: Keyframe = { opacity };
    const to: Keyframe = { opacity: target ? 1 : 0, transform: "none" };

    animationRef.current?.cancel();
    if (target) {
      const {
        offsetLeft: x,
        offsetTop: y,
        offsetWidth: width,
        offsetHeight: height,
      } = target;
      from = {
        opacity,
        transform:
          opacity > 0 && previous.width > 0
            ? `translate(${previous.left - origin.left - group.clientLeft - x}px, ${previous.top - origin.top - group.clientTop - y}px) scale(${previous.width / width}, ${previous.height / height})`
            : `translate(${width * 0.05}px, ${height * 0.05}px) scale(0.9)`,
      };
      Object.assign(indicator.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    } else if (opacity > 0) {
      Object.assign(indicator.style, {
        left: `${previous.left - origin.left - group.clientLeft}px`,
        top: `${previous.top - origin.top - group.clientTop}px`,
        width: `${previous.width}px`,
        height: `${previous.height}px`,
      });
    }
    indicator.style.opacity = target ? "1" : "0";
    group.dataset.indicatorReady = "true";
    if (animate && ready && duration > 0 && (target || opacity > 0)) {
      animationRef.current = indicator.animate([from, to], {
        duration,
        easing,
      });
    }
  }, []);

  useLayoutEffect(() => update(true), [page, update]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const snap = () => update(false);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(snap);
    observer?.observe(group);
    group
      .querySelectorAll("button")
      .forEach((button) => observer?.observe(button));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.addEventListener("change", snap);
    window.addEventListener("resize", snap);
    return () => {
      observer?.disconnect();
      reduced.removeEventListener("change", snap);
      window.removeEventListener("resize", snap);
      animationRef.current?.cancel();
    };
  }, [update]);

  return (
    <div
      ref={groupRef}
      className="ds-control-group ds-glass topbar-control-group"
    >
      <span
        ref={indicatorRef}
        className="topbar-selection"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
