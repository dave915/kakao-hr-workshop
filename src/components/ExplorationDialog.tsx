import { useRef, type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";
import { useOverlayHistory } from "../hooks/useOverlayHistory";
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
  useDialog(ref, onClose);
  useOverlayHistory(onMap ?? onClose, directionMode);
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
          className="ds-icon-button ds-glass"
          onClick={directionMode ? onMap : onClose}
          aria-label={directionMode ? "지도로 돌아가기" : "큰 지도 닫기"}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <span>{directionMode ? "FOLLOW THE DIRECTION" : "EXPLORE MODE"}</span>
          <strong data-dialog-title tabIndex={-1}>
            {title}
          </strong>
        </div>
        <button
          className="text-button exploration-list-control ds-glass"
          onClick={onClose}
        >
          <NotebookPen size={16} />
          보물 목록
        </button>
      </header>
      {children}
    </dialog>
  );
}
