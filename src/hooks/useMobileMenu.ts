import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { lockDocumentScroll } from "../lib/scroll-lock";
import { useOverlayHistory } from "./useOverlayHistory";
import { useMobileMenuSwipe } from "./useMobileMenuSwipe";

/** Keep the document still while the mobile sidebar owns scrolling, including iOS. */
export function useMobileMenu(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  useMobileMenuSwipe(enabled && !open, show);
  const unlock = useRef<(() => void) | null>(null);
  const restoreFocus = useRef(true);
  const close = useCallback(() => {
    // Restore synchronously so navigation can subsequently scroll the new page to top.
    unlock.current?.();
    unlock.current = null;
    setOpen(false);
  }, []);
  const closeForNavigation = useCallback(() => {
    restoreFocus.current = false;
    close();
  }, [close]);

  useOverlayHistory(close, open);

  useLayoutEffect(() => {
    const sidebar = document.getElementById("main-sidebar");
    if (!sidebar) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const update = () => {
      // Keep the panel mounted for its exit animation, but immediately remove
      // closed mobile controls from keyboard and assistive-technology access.
      sidebar.inert = mobile.matches && !open;
    };
    update();
    mobile.addEventListener("change", update);
    return () => {
      sidebar.inert = false;
      mobile.removeEventListener("change", update);
    };
  }, [open, enabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    if (!enabled || !mobile.matches) {
      close();
      return;
    }
    const restore = lockDocumentScroll();
    unlock.current = restore;
    restoreFocus.current = true;
    // Touch browsers do not always focus a button when it is tapped.
    const trigger = document.querySelector<HTMLButtonElement>(
      ".mobile-menu-button",
    );
    const sidebar = document.getElementById("main-sidebar");
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".main-shell, .bottom-nav, .skip-link, .toast",
      ),
    ).map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => {
      element.inert = true;
    });
    const items = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    sidebar
      ?.querySelector<HTMLElement>("[data-dialog-title]")
      ?.focus({ preventScroll: true });
    const resize = () => {
      if (!mobile.matches) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const focusable = items();
        const first = focusable[0],
          last = focusable.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (
          !focusable.includes(document.activeElement as HTMLElement) ||
          (event.shiftKey
            ? document.activeElement === first
            : document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    mobile.addEventListener("change", resize);
    window.addEventListener("keydown", escape);
    return () => {
      restore();
      background.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      if (restoreFocus.current && trigger?.isConnected)
        trigger.focus({ preventScroll: true });
      if (unlock.current === restore) unlock.current = null;
      mobile.removeEventListener("change", resize);
      window.removeEventListener("keydown", escape);
    };
  }, [open, enabled, close]);

  return {
    open,
    close,
    closeForNavigation,
    toggle: () => (open ? close() : show()),
  };
}
