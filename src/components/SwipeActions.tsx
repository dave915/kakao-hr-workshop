import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
} from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const ACTION_WIDTH = 152;

/** A horizontal reveal that leaves native vertical scrolling and keyboard controls intact. */
export default function SwipeActions({
  label,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  disabled = false,
  actionsDisabled = false,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
  actionsDisabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const row = useRef<HTMLDivElement>(null);
  const changeOpen = useRef(onOpenChange);
  useLayoutEffect(() => {
    changeOpen.current = onOpenChange;
  });
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !row.current?.contains(event.target))
        changeOpen.current(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
    };
  }, [open]);
  const content = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const offset = useRef(0);
  const suppressClickUntil = useRef(0);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    base: number;
    horizontal: boolean;
  } | null>(null);
  const draw = (value: number) => {
    offset.current = value;
    content.current?.style.setProperty("--swipe-offset", `${value}px`);
  };
  useLayoutEffect(() => {
    if (disabled) drag.current = null;
    if (!drag.current) {
      if (content.current) content.current.dataset.dragging = "false";
      draw(open ? -ACTION_WIDTH : 0);
    }
  }, [open, disabled]);
  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    drag.current = null;
    if (content.current) content.current.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!gesture.horizontal) return;
    suppressClickUntil.current = Date.now() + 400;
    const nextOpen = cancelled ? open : offset.current < -ACTION_WIDTH * 0.4;
    draw(nextOpen ? -ACTION_WIDTH : 0);
    onOpenChange(nextOpen);
  };
  const act = (action: () => void) => {
    suppressClickUntil.current = 0;
    menu.current?.focus({ preventScroll: true });
    onOpenChange(false);
    action();
  };
  return (
    <div ref={row} className="swipe-row" data-swipe-row data-open={open}>
      <div
        id={id}
        className="swipe-row-actions"
        inert={!open}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="swipe-action-edit"
          disabled={disabled || actionsDisabled}
          aria-label={`${label} 수정`}
          onClick={() => act(onEdit)}
        >
          <Pencil size={18} aria-hidden="true" />
          수정
        </button>
        <button
          type="button"
          className="swipe-action-delete"
          disabled={disabled || actionsDisabled}
          aria-label={`${label} 삭제`}
          onClick={() => act(onDelete)}
        >
          <Trash2 size={18} aria-hidden="true" />
          삭제
        </button>
      </div>
      <div
        ref={content}
        className="swipe-row-content"
        onPointerDown={(event) => {
          if (
            disabled ||
            !event.isPrimary ||
            event.button !== 0 ||
            (event.target instanceof Element &&
              event.target.closest("[data-swipe-menu]"))
          )
            return;
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            base: offset.current,
            horizontal: false,
          };
        }}
        onPointerMove={(event) => {
          const gesture = drag.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          const dx = event.clientX - gesture.x,
            dy = event.clientY - gesture.y;
          if (!gesture.horizontal) {
            if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
              drag.current = null;
              return;
            }
            if (Math.abs(dx) < 10) return;
            gesture.horizontal = true;
            event.currentTarget.dataset.dragging = "true";
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          event.preventDefault();
          draw(Math.max(-ACTION_WIDTH, Math.min(0, gesture.base + dx)));
        }}
        onPointerUp={(event) => end(event)}
        onPointerCancel={(event) => end(event, true)}
        onLostPointerCapture={(event) => {
          // A touch initially captures the child button. Moving capture to the
          // row bubbles that child's lost event here; it is not a cancelled drag.
          if (event.target === event.currentTarget) end(event, true);
        }}
        onClickCapture={(event) => {
          const fromMenu =
            event.target instanceof Element &&
            event.target.closest("[data-swipe-menu]");
          if (
            (event.detail !== 0 && Date.now() < suppressClickUntil.current) ||
            (open && !fromMenu)
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (Date.now() >= suppressClickUntil.current) onOpenChange(false);
          }
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onOpenChange(true);
          }
          if (event.key === "ArrowRight" || (event.key === "Escape" && open)) {
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }
        }}
      >
        {children}
        <button
          ref={menu}
          type="button"
          className="swipe-row-menu"
          data-swipe-menu
          aria-label={`${label} 수정·삭제 메뉴`}
          aria-expanded={open}
          aria-controls={id}
          disabled={disabled}
          title={
            actionsDisabled
              ? "확정을 취소하면 수정·삭제할 수 있어요"
              : "수정·삭제"
          }
          onClick={() => onOpenChange(!open)}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
