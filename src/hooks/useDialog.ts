import { useLayoutEffect, type RefObject } from "react";
import { openDialog } from "../lib/dialog-focus";
import { lockDocumentScroll } from "../lib/scroll-lock";
import { useOverlayHistory } from "./useOverlayHistory";

/** Shared focus, scroll and browser-back behavior for every native dialog. */
export function useDialog(
  ref: RefObject<HTMLDialogElement | null>,
  onBack: () => void,
) {
  useOverlayHistory(onBack);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const unlock = lockDocumentScroll();
    openDialog(dialog);
    return () => {
      dialog?.close();
      unlock();
    };
  }, [ref]);
}
