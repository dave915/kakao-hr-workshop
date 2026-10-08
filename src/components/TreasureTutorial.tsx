import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { lockDocumentScroll } from "../lib/scroll-lock";

const videoUrl = `${import.meta.env.BASE_URL}guides/treasure-hunt-v1.mp4`;
const posterUrl = `${import.meta.env.BASE_URL}guides/treasure-hunt-v1.webp`;

export default function TreasureTutorial({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const summaryId = useId();
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const element = dialog.current;
    const player = video.current;
    const unlock = lockDocumentScroll();
    element?.showModal();
    void player?.play().catch(() => {
      // Native playback controls remain available if autoplay is blocked.
    });
    return () => {
      player?.pause();
      element?.close();
      unlock();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="treasure-tutorial-dialog"
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="treasure-tutorial-header">
        <h2 id={titleId}>보물 찾는 방법</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="가이드 닫기"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <p id={summaryId} className="sr-only">
        미발견 보물을 선택하고 큰 지도에서 탐색을 시작해요. 나침반을 크게 열어
        화살표 방향으로 이동해요. 가까워지면 카메라를 켜고 위치와 방향 권한을
        허용한 뒤, 주변을 비추고 화면 속 보물상자를 눌러 발견해요.
      </p>
      <div className="treasure-tutorial-media">
        {failed ? (
          <div className="treasure-tutorial-error" role="status">
            <strong>가이드 영상을 불러오지 못했어요</strong>
            <p>인터넷 연결을 확인하고 다시 열어주세요.</p>
            <p>보물 선택 → 나침반으로 이동 → AR 켜기 → 보물상자 터치</p>
            <a
              className="text-button"
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
            >
              영상 따로 열기 <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        ) : (
          <video
            ref={video}
            src={videoUrl}
            poster={posterUrl}
            controls
            muted
            playsInline
            preload="metadata"
            aria-label="보물 선택부터 AR로 발견하기까지 안내 영상"
            aria-describedby={summaryId}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <footer className="treasure-tutorial-footer">
        <button className="button dark full" onClick={onClose}>
          보물 찾으러 가기
          <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </footer>
    </dialog>
  );
}
