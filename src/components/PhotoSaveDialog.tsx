import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, LoaderCircle, X } from "lucide-react";
import type { PhotoPost } from "../../shared/photos";
import { useDialog } from "../hooks/useDialog";
import { getPhotoDownload } from "../lib/photos";
import { canSharePhoto, preparePhotoImage } from "../lib/photo-save";

export default function PhotoSaveDialog({
  post,
  index,
  onClose,
}: {
  post: PhotoPost;
  index: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [image, setImage] = useState<
    Awaited<ReturnType<typeof preparePhotoImage>> | undefined
  >();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const pending = useRef(false);
  useDialog(dialog, onClose);

  useEffect(() => {
    const controller = new AbortController();
    let prepared: Awaited<ReturnType<typeof preparePhotoImage>> | undefined;
    setError("");
    setImage(undefined);
    void (async () => {
      try {
        const source = await getPhotoDownload(post, index);
        prepared = await preparePhotoImage(source, controller.signal);
        if (controller.signal.aborted) prepared.release();
        else setImage(prepared);
      } catch {
        if (!controller.signal.aborted)
          setError(
            "사진을 불러오지 못했어요. 연결을 확인하고 다시 눌러주세요.",
          );
      }
    })();
    return () => {
      controller.abort();
      prepared?.release();
    };
  }, [post, index, attempt]);

  const shareable = image && canSharePhoto(image.file);
  const touch = navigator.maxTouchPoints > 0;

  async function share() {
    if (!image || pending.current) return;
    pending.current = true;
    setSharing(true);
    setShareError("");
    try {
      // The image is already prepared, so this runs directly in the tap's
      // activation window even on slow networks. Only the JPEG is shared.
      await navigator.share({ files: [image.file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setShareError(
          "저장 메뉴를 열지 못했어요. 아래 사진을 길게 눌러 저장해주세요.",
        );
    } finally {
      pending.current = false;
      setSharing(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="drawer photo-save-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer-content">
        <div className="drawer-header">
          <h2 id={titleId} data-dialog-title tabIndex={-1}>
            사진 저장
          </h2>
          <button
            className="ds-icon-button ds-glass"
            onClick={onClose}
            aria-label="사진 저장 닫기"
          >
            <X size={22} />
          </button>
        </div>
        {image ? (
          <div className="photo-save-content">
            <p className="photo-save-help">
              {shareable
                ? "이미지 저장을 누른 뒤 공유 메뉴에서 ‘이미지 저장’ 또는 사진 앱을 선택해주세요."
                : touch
                  ? "아래 사진을 길게 누른 뒤 ‘사진에 저장’ 또는 ‘이미지 저장’을 선택해주세요."
                  : "JPEG 이미지로 저장합니다. 크게보기와 같은 화질이에요."}
            </p>
            {shareable ? (
              <button
                className="button yellow full"
                onClick={() => void share()}
                disabled={sharing}
                aria-busy={sharing}
              >
                {sharing ? (
                  <LoaderCircle size={18} className="photo-spinning" />
                ) : (
                  <Download size={18} />
                )}
                {sharing ? "저장 메뉴 열림" : "이미지 저장"}
              </button>
            ) : !touch ? (
              <a
                className="button yellow full"
                href={image.url}
                download={image.file.name}
              >
                <Download size={18} /> JPEG 이미지 저장
              </a>
            ) : null}
            {shareError && (
              <p className="form-error" role="alert">
                {shareError}
              </p>
            )}
            <img
              className="photo-save-image"
              src={image.url}
              alt={`저장할 사진 ${index + 1}`}
            />
            {shareable && (
              <p className="photo-save-help">
                사진을 길게 눌러 저장할 수도 있어요.
              </p>
            )}
          </div>
        ) : error ? (
          <div className="photo-save-content">
            <p className="form-error" role="alert">
              {error}
            </p>
            <button
              className="button full"
              onClick={() => setAttempt(attempt + 1)}
            >
              다시 불러오기
            </button>
          </div>
        ) : (
          <p className="photo-save-loading" role="status">
            <LoaderCircle size={20} className="photo-spinning" /> 사진을
            준비하고 있어요…
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
