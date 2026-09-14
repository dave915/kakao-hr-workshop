import { ArrowUpRight, Sparkles, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d?.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="drawer-title"
    >
      <div className="drawer-content">
        <div className="drawer-header">
          <h2 id="drawer-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
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
