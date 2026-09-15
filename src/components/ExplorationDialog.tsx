import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, NotebookPen } from "lucide-react";
export default function ExplorationDialog({
  children,
  onClose,
  title,
  directionMode = false,
  onMap,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  directionMode?: boolean;
  onMap?: () => void;
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
      className={`exploration-dialog ${directionMode ? "is-direction-mode" : ""}`}
      aria-label={
        directionMode ? "큰 나침반으로 보물 찾기" : "큰 지도에서 보물 탐색"
      }
      onCancel={(e) => {
        e.preventDefault();
        if (directionMode) onMap?.();
        else onClose();
      }}
    >
      <header className="focus-map-header">
        <button
          className="icon-button"
          onClick={directionMode ? onMap : onClose}
          aria-label={directionMode ? "지도로 돌아가기" : "큰 지도 닫기"}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <span>{directionMode ? "FOLLOW THE DIRECTION" : "EXPLORE MODE"}</span>
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
