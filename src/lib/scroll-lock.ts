let locks = 0;
let restore: (() => void) | undefined;

/** Freeze the underlying document, while allowing overlay contents to scroll. */
export function lockDocumentScroll() {
  if (locks === 0) {
    const body = document.body;
    const root = document.documentElement;
    const { scrollX, scrollY } = window;
    const styles = [
      [
        body.style,
        ["position", "top", "left", "width", "overflow", "padding-right"],
      ],
      [root.style, ["overflow", "overscroll-behavior"]],
    ] as const;
    const previous = styles.flatMap(([style, names]) =>
      names.map((name) => ({
        style,
        name,
        value: style.getPropertyValue(name),
        priority: style.getPropertyPriority(name),
      })),
    );
    const scrollbar = window.innerWidth - root.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${padding + scrollbar}px`;
    restore = () => {
      for (const { style, name, value, priority } of previous) {
        if (value) style.setProperty(name, value, priority);
        else style.removeProperty(name);
      }
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    };
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) {
      restore?.();
      restore = undefined;
    }
  };
}
