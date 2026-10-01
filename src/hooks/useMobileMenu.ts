import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Keep the document still while the mobile sidebar owns scrolling, including iOS. */
export function useMobileMenu(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const unlock = useRef<(() => void) | null>(null);
  const close = useCallback(() => {
    // Restore synchronously so navigation can subsequently scroll the new page to top.
    unlock.current?.();
    unlock.current = null;
    setOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    if (!enabled || !mobile.matches) {
      close();
      return;
    }
    const { scrollX, scrollY } = window;
    const body = document.body;
    const root = document.documentElement;
    const properties = [
      "position",
      "top",
      "left",
      "width",
      "overflow",
    ] as const;
    const previous = properties.map(
      (name) =>
        [
          name,
          body.style.getPropertyValue(name),
          body.style.getPropertyPriority(name),
        ] as const,
    );
    const rootOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      for (const [name, value, priority] of previous) {
        if (value) body.style.setProperty(name, value, priority);
        else body.style.removeProperty(name);
      }
      root.style.overflow = rootOverflow;
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    };
    unlock.current = restore;
    const resize = () => {
      if (!mobile.matches) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    mobile.addEventListener("change", resize);
    window.addEventListener("keydown", escape);
    return () => {
      restore();
      if (unlock.current === restore) unlock.current = null;
      mobile.removeEventListener("change", resize);
      window.removeEventListener("keydown", escape);
    };
  }, [open, enabled, close]);

  return { open, close, toggle: () => (open ? close() : setOpen(true)) };
}
