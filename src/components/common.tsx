import { ArrowUpRight, Sparkles, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";
export function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Sparkles size={30} />
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
export function Drawer({
  title,
  children,
  onClose,
  className = "",
  fitViewport = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  fitViewport?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    if (!fitViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      if (viewport && viewport.scale !== 1) return;
      ref.current?.style.setProperty(
        "--dialog-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      ref.current?.style.setProperty(
        "--dialog-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [fitViewport]);
  useDialog(ref, onClose);
  return (
    <dialog
      ref={ref}
      className={`drawer ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="drawer-content">
        <div className="drawer-header">
          <h2 id={titleId} data-dialog-title tabIndex={-1}>
            {title}
          </h2>
          <button
            className="ds-icon-button ds-glass"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Avatar({ name, size = "" }: { name: string; size?: string }) {
  return (
    <span className={`avatar ${size}`}>{name.slice(0, 1).toUpperCase()}</span>
  );
}
export type Notify = (message: string) => void;
