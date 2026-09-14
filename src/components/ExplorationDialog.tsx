import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, NotebookPen } from "lucide-react";
export default function ExplorationDialog({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="exploration-dialog"
      aria-label="큰 지도에서 보물 탐색"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="focus-map-header">
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="큰 지도 닫기"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <span>EXPLORE MODE</span>
          <strong>{title}</strong>
        </div>
        <button className="text-button" onClick={onClose}>
          <NotebookPen size={16} />
          힌트 목록
        </button>
      </header>
      {children}
    </dialog>
  );
}
