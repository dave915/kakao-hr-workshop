import { useLayoutEffect } from "react";

/** Distinguish keyboard navigation from touch/mouse and scripted focus moves. */
export function useInputModality() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.inputModality;
    root.dataset.inputModality ??= "pointer";
    const pointer = () => {
      root.dataset.inputModality = "pointer";
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key))
        root.dataset.inputModality = "keyboard";
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      if (previous) root.dataset.inputModality = previous;
      else delete root.dataset.inputModality;
    };
  }, []);
}
