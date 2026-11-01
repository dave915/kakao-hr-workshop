import { useLayoutEffect, useRef } from "react";

/** Keep scroll clearance and the mobile drawer aligned with resized navigation. */
export function useNavigationInsets(enabled: boolean) {
  const topbarRef = useRef<HTMLElement>(null);
  const bottomNavRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty(
        "--ds-measured-topbar-height",
        `${topbarRef.current?.getBoundingClientRect().height ?? 0}px`,
      );
      root.style.setProperty(
        "--ds-measured-tabbar-height",
        `${bottomNavRef.current?.getBoundingClientRect().height ?? 0}px`,
      );
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (topbarRef.current) observer?.observe(topbarRef.current);
    if (bottomNavRef.current) observer?.observe(bottomNavRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--ds-measured-topbar-height");
      root.style.removeProperty("--ds-measured-tabbar-height");
    };
  }, [enabled]);

  return { topbarRef, bottomNavRef };
}
