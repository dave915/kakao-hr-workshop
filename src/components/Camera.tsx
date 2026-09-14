import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import { TreasureIllustration } from "./ExpeditionArt";
export default function Camera() {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let dead = false;
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("이 환경에서는 카메라를 사용할 수 없어요.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      .then((s) => {
        if (dead) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (ref.current) {
          ref.current.srcObject = s;
          void ref.current
            .play()
            .catch(() => setError("카메라 화면을 재생하지 못했어요."));
        }
      })
      .catch(() =>
        setError(
          "카메라 권한을 허용해주세요. 카메라 없이도 보물을 찾을 수 있어요.",
        ),
      );
    return () => {
      dead = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="camera-view">
      {error ? (
        <div className="empty-state">
          <CameraOff size={35} />
          <p role="alert">{error}</p>
        </div>
      ) : (
        <>
          <video ref={ref} muted playsInline autoPlay />
          <div className="camera-overlay">
            <TreasureIllustration />
            <p>여기서 발견할 수 있을까요?</p>
          </div>
        </>
      )}
      <p className="camera-caption">
        카메라 위에 보물 이미지를 띄우는 연출이에요. 실제 발견은 지도에서 GPS
        위치를 확인해요.
      </p>
    </div>
  );
}
