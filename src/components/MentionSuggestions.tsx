import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useWorkshop } from "../lib/store";
import { englishName } from "../lib/utils";
import {
  insertMention,
  mentionAtCaret,
  mentionCandidates,
} from "../../shared/mentions";
import type { Member } from "../../shared/types";

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
    if (visible)
      document
        .getElementById(`${id}-option-${index}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [id, index, visible]);

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
      {visible && (
        <div className="photo-mention-panel">
          <div className="photo-mention-heading">
            <strong>멘션할 참가자</strong>
            <span role="status">{candidates.length}명</span>
          </div>
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
          <p className="photo-mention-help">
            이름·아이디로 검색해요. 대소문자는 구분하지 않아요.
          </p>
        </div>
      )}
    </div>
  );
}
