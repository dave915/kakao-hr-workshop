import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Camera as CameraIcon,
  Compass,
  LocateFixed,
  Map,
  RotateCcw,
  X,
} from "lucide-react";
import { TreasureChestArt } from "./ExpeditionArt";
import { useDevicePose } from "../hooks/useDevicePose";
import { useExploration } from "../hooks/useExploration";
import {
  AR_MAX_ACCURACY,
  AR_POSITION_MAX_AGE,
  AR_TARGET_MAX_AGE,
} from "../../shared/exploration";
import { angleDifference, cameraBasis, projectArTarget } from "../../shared/ar";
import { distanceMeters } from "../../shared/game";
import type { ActionInput } from "../../shared/validation";
import type {
  ActionResponse,
  Position,
  VisibleTreasure,
} from "../../shared/types";
import { errorMessage } from "../lib/utils";

interface Props {
  treasure: VisibleTreasure;
  act: (input: ActionInput) => Promise<ActionResponse>;
  now: number;
  busy: boolean;
  onClaim: (position: Position) => Promise<string | undefined>;
  onClose: () => void;
  onMap: () => void;
}
export default function Camera({
  treasure,
  act,
  now,
  busy,
  onClaim,
  onClose,
  onMap,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [claimError, setClaimError] = useState("");
  const [viewport, setViewport] = useState({
    width: 0,
    height: 0,
    videoWidth: 0,
    videoHeight: 0,
    screenAngle: 0,
  });
  const sensor = useDevicePose();
  const tracking = useExploration(act, "ar");
  const stopStream = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  };
  useEffect(() => {
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      generation.current++;
      stopStream();
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    const measure = () => {
      const rect = scene.current?.getBoundingClientRect();
      setViewport({
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        videoWidth: video.current?.videoWidth ?? 0,
        videoHeight: video.current?.videoHeight ?? 0,
        screenAngle:
          screen.orientation?.angle ??
          (window as Window & { orientation?: number }).orientation ??
          0,
      });
    };
    const observer = new ResizeObserver(measure);
    if (scene.current) observer.observe(scene.current);
    const element = video.current;
    element?.addEventListener("loadedmetadata", measure);
    element?.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      element?.removeEventListener("loadedmetadata", measure);
      element?.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    const pause = () => {
      if (!document.hidden) return;
      generation.current++;
      stopStream();
      tracking.stop();
      sensor.stop();
      setActive(false);
      setStarting(false);
      setPaused(true);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [tracking.stop, sensor.stop]);
  const start = async () => {
    if (starting) return;
    stopStream();
    tracking.stop();
    const run = ++generation.current;
    setStarting(true);
    setActive(false);
    setError("");
    setClaimError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("카메라를 지원하는 휴대폰 브라우저에서 열어주세요.");
      // Both prompts start within this button gesture; iOS motion permission needs it.
      const orientation = sensor.start();
      const media = navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        .then((value) => {
          if (run !== generation.current)
            value.getTracks().forEach((track) => track.stop());
          else stream.current = value;
          return value;
        });
      const [hasOrientation, camera] = await Promise.all([orientation, media]);
      if (run !== generation.current) return;
      if (!hasOrientation) {
        stopStream();
        return;
      }
      if (camera.getVideoTracks()[0]?.getSettings().facingMode === "user")
        throw new Error(
          "위치 AR에는 후면 카메라가 필요해요. 후면 카메라가 있는 휴대폰에서 열어주세요.",
        );
      if (!video.current) return;
      video.current.srcObject = camera;
      await video.current.play();
      if (run !== generation.current) return;
      camera.getVideoTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            if (run !== generation.current) return;
            generation.current++;
            stopStream();
            sensor.stop();
            tracking.stop();
            setActive(false);
            setError("카메라 연결이 끊겼어요. 다시 켜주세요.");
          },
          { once: true },
        ),
      );
      setActive(true);
      setPaused(false);
      tracking.start(treasure.id);
    } catch (e) {
      if (run !== generation.current) return;
      stopStream();
      sensor.stop();
      tracking.stop();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "카메라 권한을 허용해주세요. 브라우저 설정에서 변경한 뒤 다시 켤 수 있어요."
          : errorMessage(e),
      );
    } finally {
      if (run === generation.current) setStarting(false);
    }
  };
  const position = tracking.position;
  const positionFresh =
    position &&
    position.accuracy > 0 &&
    position.accuracy <= AR_MAX_ACCURACY &&
    Math.abs(now - position.timestamp) <= AR_POSITION_MAX_AGE;
  const pose =
    sensor.pose && Math.abs(now - sensor.pose.updatedAt) < 3000
      ? sensor.pose
      : null;
  const guidance =
    tracking.guidance &&
    Math.abs(now - tracking.guidance.updatedAt) <= AR_TARGET_MAX_AGE
      ? tracking.guidance
      : null;
  const target =
    tracking.arTarget &&
    positionFresh &&
    position &&
    !tracking.error &&
    guidance &&
    Math.abs(now - tracking.arTarget.updatedAt) <= AR_TARGET_MAX_AGE &&
    distanceMeters(position, tracking.arTarget) <=
      tracking.arTarget.visibilityRange
      ? tracking.arTarget
      : null;
  const projection =
    active && target && position && pose
      ? projectArTarget(position, target, pose, viewport)
      : null;
  const ready =
    active &&
    positionFresh &&
    pose &&
    guidance &&
    !tracking.error &&
    navigator.onLine;
  const canClaim = Boolean(
    ready &&
    target &&
    position &&
    guidance.withinRange &&
    distanceMeters(position, target) <= treasure.radius,
  );
  const turn =
    pose && guidance?.bearing != null
      ? angleDifference(guidance.bearing, cameraBasis(pose).heading)
      : 0;
  const cue = projection?.cue ?? (turn < 0 ? "left" : "right");
  const CueIcon = {
    left: ArrowLeft,
    right: ArrowRight,
    up: ArrowUp,
    down: ArrowDown,
  }[cue];
  const cueText = {
    left: "왼쪽을 비춰보세요",
    right: "오른쪽을 비춰보세요",
    up: "카메라를 조금 올려보세요",
    down: "카메라를 아래로 내려보세요",
  }[cue];
  const distance = projection?.distance ?? guidance?.distance;
  const status = !navigator.onLine
    ? "연결이 끊겼어요. 인터넷이 연결되면 다시 안내해요."
    : tracking.error ||
      sensor.error ||
      (active && !positionFresh
        ? "정확한 GPS 위치를 확인하고 있어요…"
        : active && !pose
          ? "방향을 확인하고 있어요. 휴대폰을 세우고 천천히 주변을 비춰보세요."
          : active && !guidance
            ? "보물 위치를 확인하고 있어요…"
            : "");
  const claim = async () => {
    if (!canClaim || !position || busy) return;
    setClaimError("");
    try {
      setClaimError((await onClaim(position)) ?? "");
    } catch (e) {
      setClaimError(errorMessage(e));
    }
  };
  return (
    <dialog
      ref={dialog}
      className="ar-dialog"
      aria-label="위치 AR로 보물 찾기"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="ar-header">
        <div>
          <span>LOCATION AR</span>
          <strong>{treasure.name}</strong>
        </div>
        <button className="icon-button" aria-label="AR 닫기" onClick={onClose}>
          <X size={24} />
        </button>
      </header>
      <div className={`ar-scene ${active ? "is-active" : ""}`} ref={scene}>
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="후면 카메라 영상"
        />
        {active ? (
          <>
            <div className="ar-readings">
              <span>
                <LocateFixed size={14} />
                {position
                  ? `GPS 오차 ±${Math.round(position.accuracy)}m`
                  : "GPS 확인 중"}
              </span>
              <span>
                <Compass size={14} />
                {pose ? "방향 연결됨" : "방향 확인 중"}
              </span>
            </div>
            <div className="ar-reticle" aria-hidden="true" />
            {ready && projection?.visible && (
              <button
                className={`ar-treasure ${canClaim ? "in-range" : ""}`}
                style={{
                  left: projection.x,
                  top: projection.y,
                  width: projection.size,
                }}
                disabled={!canClaim || busy}
                onClick={() => void claim()}
                aria-label={`${treasure.name} ${canClaim ? "발견하기" : "더 가까이 이동해주세요"}`}
              >
                <TreasureChestArt />
                <span>
                  {canClaim
                    ? "눌러서 발견!"
                    : `약 ${Math.round(projection.distance)}m`}
                </span>
              </button>
            )}
            {ready && !projection?.visible && (
              <div className="ar-direction" role="status">
                <CueIcon size={34} />
                <strong>
                  {target
                    ? cueText
                    : guidance?.bearing == null || Math.abs(turn) < 20
                      ? "앞으로 조금 더 이동해요"
                      : cueText}
                </strong>
                <span>
                  {target
                    ? "보물이 있는 방향으로 화면을 돌려요"
                    : "가까이 가면 실제 위치에 보물이 나타나요"}
                </span>
              </div>
            )}
            {status && (
              <div className="ar-status" role="status">
                <Compass size={28} />
                <p>{status}</p>
              </div>
            )}
          </>
        ) : (
          <div className="ar-intro">
            <span className="eyebrow">힌트 너머, 실제 풍경 속으로</span>
            <TreasureChestArt />
            <h2>{paused ? "탐험을 이어갈까요?" : "보물 위치를 비춰보세요"}</h2>
            <p>
              휴대폰을 돌리면 보물이 있는 방향에 나타나요.
              <br />
              가까이 다가가 화면 속 보물을 눌러보세요.
            </p>
            <p className="ar-permission-copy">
              카메라·위치·동작 및 방향 권한을 사용해요.
              <br />
              카메라 영상은 저장하거나 전송하지 않아요.
            </p>
            {(error || sensor.error) && (
              <p className="ar-start-error" role="alert">
                {error || sensor.error}
              </p>
            )}
            <button
              className="button dark"
              disabled={starting}
              onClick={() => void start()}
            >
              <CameraIcon size={18} />
              {starting
                ? "권한을 확인하고 있어요…"
                : paused
                  ? "AR 다시 켜기"
                  : "카메라·위치·방향 켜기"}
            </button>
          </div>
        )}
      </div>
      <footer className="ar-footer">
        {active && (
          <>
            <div className="ar-distance">
              <div>
                <span>{canClaim ? "보물을 발견할 수 있어요" : "보물까지"}</span>
                <strong>
                  {ready && distance !== undefined
                    ? `약 ${distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`}`
                    : "위치 확인 중"}
                </strong>
              </div>
              <button
                className="button dark"
                disabled={!canClaim || busy}
                onClick={() => void claim()}
              >
                <LocateFixed size={17} />
                {busy ? "확인 중…" : "이 위치에서 발견하기"}
              </button>
            </div>
            {claimError && (
              <p className="ar-claim-error" role="alert">
                {claimError}
              </p>
            )}
          </>
        )}
        <p className="ar-accuracy-note">
          GPS·나침반 오차로 보물이 조금 어긋날 수 있어요. 잠시 멈춰 주변을
          살펴보세요.
        </p>
        <div className="ar-footer-actions">
          <button className="text-button" onClick={onMap}>
            <Map size={17} />
            지도에서 이어가기
          </button>
          {active && (
            <button
              className="text-button"
              disabled={busy || starting}
              onClick={() => void start()}
            >
              <RotateCcw size={16} />
              센서 다시 켜기
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
