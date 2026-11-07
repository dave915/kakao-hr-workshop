import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { isVideo, type PhotoPost } from "../../shared/photos";
import { getPhotoDownload } from "../lib/photos";
import { englishName } from "../lib/utils";

interface Props {
  post: PhotoPost;
  index: number;
  compact?: boolean;
}

export default function PhotoDownload(props: Props) {
  return <DownloadControl key={props.post.id} {...props} />;
}

function DownloadControl({ post, index, compact = false }: Props) {
  const live = useRef(true),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const label = `${englishName(post.authorHandle)}의 ${isVideo(post.photos[index]) ? "동영상" : "사진"} ${index + 1} 다운로드`;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function download() {
    if (pending.current) return;
    setError("");
    setStatus("");
    if (!navigator.onLine) {
      setError("인터넷에 연결한 뒤 다시 눌러주세요.");
      return;
    }
    pending.current = true;
    setBusy(true);
    let file: Awaited<ReturnType<typeof getPhotoDownload>> | undefined;
    let started = false;
    try {
      file = await getPhotoDownload(post, index);
      if (!live.current) return;
      const link = document.createElement("a");
      link.href = file.url;
      link.download = file.filename;
      link.referrerPolicy = "no-referrer";
      document.body.appendChild(link);
      try {
        link.click();
        started = true;
      } finally {
        link.remove();
      }
      setStatus(
        "다운로드를 요청했어요. 브라우저의 다운로드 목록을 확인해주세요.",
      );
    } catch {
      if (live.current)
        setError(
          "다운로드를 준비하지 못했어요. 사진첩을 새로고침하고 다시 눌러주세요.",
        );
    } finally {
      if (file) {
        // A demo blob URL must remain alive long enough for the browser to take
        // ownership of the download, including when the viewer closes at once.
        if (started && file.url.startsWith("blob:"))
          setTimeout(file.release, 60000);
        else file.release();
      }
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }

  return (
    <span className="photo-download-control">
      <button
        type="button"
        className={compact ? "ds-icon-button photo-download" : "photo-download"}
        aria-label={busy ? "다운로드 준비 중" : label}
        title={busy ? "다운로드 준비 중" : "다운로드"}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? (
          <LoaderCircle size={20} className="photo-spinning" />
        ) : (
          <Download size={20} />
        )}
        {!compact && <span className="photo-download-label">다운로드</span>}
      </button>
      {error && (
        <span className="photo-download-error" role="alert">
          {error}
        </span>
      )}
      <span className="sr-only" role="status">
        {status}
      </span>
    </span>
  );
}
