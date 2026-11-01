import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { overlayHistory } from "../lib/overlay-history";

/** Back dismisses the top layer; closing by any other means removes its entry. */
export function useOverlayHistory(onBack: () => void, enabled = true) {
  const callback = useRef(onBack);
  useLayoutEffect(() => {
    callback.current = onBack;
  });
  useLayoutEffect(() => {
    if (!enabled) return;
    return overlayHistory().register(() => {
      // Commit before history reconciliation so guarded/busy closes can be detected.
      flushSync(() => callback.current());
    });
  }, [enabled]);
}
