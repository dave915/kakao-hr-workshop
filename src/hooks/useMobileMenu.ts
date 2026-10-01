import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { lockDocumentScroll } from "../lib/scroll-lock";

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
    const restore = lockDocumentScroll();
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
