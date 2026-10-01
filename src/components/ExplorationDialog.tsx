import { useLayoutEffect, useRef, type ReactNode } from "react";
import { lockDocumentScroll } from "../lib/scroll-lock";
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
  useLayoutEffect(() => {
    const d = ref.current;
    const unlock = lockDocumentScroll();
    d?.showModal();
    return () => {
      d?.close();
      unlock();
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
          보물 목록
        </button>
      </header>
      {children}
    </dialog>
  );
}
