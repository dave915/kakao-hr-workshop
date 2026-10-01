import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useWorkshop } from "../lib/store";
import { englishName } from "../lib/utils";
import {
  insertMention,
  mentionAtCaret,
  mentionCandidates,
} from "../../shared/mentions";
import type { Member } from "../../shared/types";
import { textareaCaretRect } from "../lib/textarea-caret";

export default function MentionSuggestions({
  value,
  onChange,
  input,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  input: RefObject<HTMLTextAreaElement | null>;
  maxLength: number;
  disabled?: boolean;
}) {
  const { state, me } = useWorkshop();
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState("");
  const range = mentionAtCaret(value, selection.start, selection.end);
  const context = `${selection.start}:${value}`;
  const visible =
    focused && !disabled && range !== null && dismissed !== context;
  const candidates =
    visible && state
      ? mentionCandidates(Object.values(state.members), range.query)
      : [];
  const index = Math.min(active, Math.max(0, candidates.length - 1));

  useLayoutEffect(() => {
    const node = input.current;
    if (!visible || !node) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const rect = node.getBoundingClientRect();
      const caret = textareaCaretRect(node, selection.start);
      if (caret.top + caret.height <= rect.top || caret.top >= rect.bottom) {
        setPlacement(null);
        return;
      }
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const right = viewportLeft + (viewport?.width ?? window.innerWidth);
      const bottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const dialog = node.closest("dialog")?.getBoundingClientRect();
      const minLeft = Math.max(viewportLeft, dialog?.left ?? viewportLeft) + 8;
      const maxRight = Math.min(right, dialog?.right ?? right) - 8;
      const width = Math.min(320, maxRight - minLeft);
      const top = caret.top + caret.height + 4;
      setPlacement({
        left: Math.max(minLeft, Math.min(caret.left, maxRight - width)),
        top,
        width,
        maxHeight: Math.max(44, Math.min(220, bottom - top - 8)),
      });
    };
    let frame = 0;
    const schedule = (event?: Event) => {
      if (
        event?.target instanceof Node &&
        popup.current?.contains(event.target)
      )
        return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(() => schedule());
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [input, visible, value, selection.start]);

  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const sync = () =>
      setSelection({ start: node.selectionStart, end: node.selectionEnd });
    const change = () => {
      setDismissed("");
      sync();
    };
    const focus = () => {
      setFocused(true);
      setDismissed("");
      sync();
    };
    const blur = (event: FocusEvent) => {
      if (!(
        event.relatedTarget instanceof Node &&
        list.current?.contains(event.relatedTarget)
      ))
        setFocused(false);
    };
    node.addEventListener("input", change);
    for (const event of ["select", "click", "keyup"])
      node.addEventListener(event, sync);
    node.addEventListener("focus", focus);
    node.addEventListener("blur", blur);
    if (document.activeElement === node) focus();
    return () => {
      node.removeEventListener("input", change);
      for (const event of ["select", "click", "keyup"])
        node.removeEventListener(event, sync);
      node.removeEventListener("focus", focus);
      node.removeEventListener("blur", blur);
    };
  }, [input]);

  useEffect(() => {
    setActive(0);
  }, [range?.start, range?.query]);
  useEffect(() => {
    const options = document.getElementById(id);
    const option = document.getElementById(`${id}-option-${index}`);
    if (!visible || !options || !option) return;
    const container = options.getBoundingClientRect(),
      target = option.getBoundingClientRect();
    if (target.top < container.top)
      options.scrollTop -= container.top - target.top;
    else if (target.bottom > container.bottom)
      options.scrollTop += target.bottom - container.bottom;
  }, [id, index, visible, placement]);

  function choose(member: Member) {
    if (!range || disabled) return;
    const result = insertMention(value, range, member.handle, maxLength);
    if (!result) return;
    onChange(result.value);
    setDismissed(`${result.caret}:${result.value}`);
    setSelection({ start: result.caret, end: result.caret });
    requestAnimationFrame(() => {
      const node = input.current;
      if (!node) return;
      node.focus({ preventScroll: true });
      node.setSelectionRange(result.caret, result.caret);
      setSelection({ start: result.caret, end: result.caret });
    });
  }

  useEffect(() => {
    const node = input.current;
    if (!node) return;
    if (visible) {
      node.setAttribute("aria-autocomplete", "list");
      node.setAttribute("aria-controls", id);
      if (candidates.length)
        node.setAttribute("aria-activedescendant", `${id}-option-${index}`);
    }
    const keydown = (event: KeyboardEvent) => {
      if (!visible || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(context);
      } else if (
        candidates.length &&
        ["ArrowDown", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        setActive(
          (current) =>
            (current +
              (event.key === "ArrowDown" ? 1 : -1) +
              candidates.length) %
            candidates.length,
        );
      } else if (
        candidates.length &&
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        choose(candidates[index]);
      }
    };
    node.addEventListener("keydown", keydown);
    return () => {
      node.removeEventListener("keydown", keydown);
      node.removeAttribute("aria-autocomplete");
      node.removeAttribute("aria-controls");
      node.removeAttribute("aria-activedescendant");
    };
  });

  return (
    <div className="photo-mentions" ref={list}>
      <p className="footnote">@를 입력하고 함께한 사람을 선택해보세요.</p>
      {visible && placement && (
        <div className="photo-mention-panel" ref={popup} style={placement}>
          <span className="sr-only" role="status">
            멘션할 참가자 {candidates.length}명
          </span>
          <div
            className="photo-mention-suggestions"
            id={id}
            role="listbox"
            aria-label="멘션할 참가자"
          >
            {candidates.map((member, candidateIndex) => (
              <button
                key={member.id}
                id={`${id}-option-${candidateIndex}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={candidateIndex === index}
                disabled={
                  !range ||
                  !insertMention(value, range, member.handle, maxLength)
                }
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(member)}
              >
                <span>
                  {englishName(member.handle)}
                  {member.id === me?.id ? " (나)" : ""}
                </span>
                <small>@{member.handle}</small>
              </button>
            ))}
            {!candidates.length && (
              <p className="photo-mention-empty">일치하는 참가자가 없어요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
