/** Measure the caret using the same font, wrapping, padding, and scroll offset. */
export function textareaCaretRect(
  input: HTMLTextAreaElement,
  position: number,
) {
  const style = getComputedStyle(input);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const properties = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-transform",
    "text-indent",
    "text-align",
    "direction",
    "tab-size",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "word-break",
  ];
  for (const property of properties)
    mirror.style.setProperty(property, style.getPropertyValue(property));
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderRight = parseFloat(style.borderRightWidth) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  Object.assign(mirror.style, {
    position: "fixed",
    left: "0",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    boxSizing: "border-box",
    width: `${input.clientWidth + borderLeft + borderRight}px`,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    borderStyle: "solid",
  });
  mirror.textContent = input.value.slice(0, position);
  marker.textContent = input.value.slice(position) || ".";
  mirror.append(marker);
  mirror.setAttribute("aria-hidden", "true");
  document.body.append(mirror);
  try {
    const rect = input.getBoundingClientRect();
    return {
      left: rect.left + borderLeft + marker.offsetLeft - input.scrollLeft,
      top: rect.top + borderTop + marker.offsetTop - input.scrollTop,
      height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6,
    };
  } finally {
    mirror.remove();
  }
}
