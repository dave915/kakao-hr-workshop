import {
  ArrowUp,
  Compass,
  Flame,
  LocateFixed,
  Pause,
  Sparkles,
  Camera,
} from "lucide-react";
import type { TreasureGuidance, VisibleTreasure } from "../../shared/types";
const labels = {
  far: "아직 조금 멀어요",
  warm: "온기가 느껴져요",
  close: "가까이 왔어요",
  hot: "아주 가까워요!",
  within: "주변에 보물이 있어요!",
};
interface Props {
  treasure: VisibleTreasure;
  guidance: TreasureGuidance | null;
  tracking: boolean;
  waiting: boolean;
  stale: boolean;
  error: string;
  trend: "closer" | "farther" | "steady";
  disabled: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onClaim: () => void;
  onAr: () => void;
}
export default function ExplorationGuide({
  treasure,
  guidance,
  tracking,
  waiting,
  stale,
  error,
  trend,
  disabled,
  busy,
  onStart,
  onStop,
  onClaim,
  onAr,
}: Props) {
  const current = tracking && !stale && !error ? guidance : null;
  const distance = current
    ? current.distance >= 1000
      ? `약 ${(current.distance / 1000).toFixed(1)}km`
      : `약 ${current.distance}m`
    : "위치 확인 중";
  return (
    <section
      className={`guide-card heat-${current?.proximity ?? "far"}`}
      aria-label="보물 탐색 안내"
    >
      <div className="guide-clue">
        <span className="eyebrow">FOLLOW THE CLUE</span>
        <h2>{treasure.name}</h2>
        <p>{treasure.hint}</p>
      </div>
      {tracking ? (
        <>
          <div className="guide-reading">
            <div
              className={`direction-beacon ${waiting ? "waiting" : ""}`}
              aria-hidden="true"
            >
              {current?.withinRange ? (
                <Sparkles size={38} />
              ) : current?.bearing != null ? (
                <ArrowUp
                  size={44}
                  style={{ transform: `rotate(${current.bearing}deg)` }}
                />
              ) : (
                <Compass size={38} />
              )}
            </div>
            <div className="guide-reading-copy">
              <span>
                {current
                  ? current.withinRange
                    ? "천천히 주변을 살펴보세요"
                    : `${current.direction}으로 이동해요`
                  : waiting
                    ? "위치를 찾고 있어요"
                    : "안내를 기다려주세요"}
              </span>
              <strong>
                {current?.withinRange ? "발견 가능 범위" : distance}
              </strong>
              <small>
                {current
                  ? trend === "closer"
                    ? "조금 전보다 가까워졌어요 ↗"
                    : trend === "farther"
                      ? "조금 멀어졌어요. 방향을 확인해요"
                      : labels[current.proximity]
                  : "위치가 확인되면 방향을 알려드릴게요."}
              </small>
            </div>
          </div>
          <div className="warmth-line">
            <span>
              <Flame size={14} />
              {current ? labels[current.proximity] : "탐험 온도"}
            </span>
            <div
              className="warmth-track"
              role="progressbar"
              aria-label="보물과 가까운 정도"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={current?.heat ?? 0}
              aria-valuetext={
                current ? labels[current.proximity] : "위치 확인 중"
              }
            >
              {[20, 40, 60, 80, 100].map((level, index) => (
                <i
                  key={level}
                  className={(current?.heat ?? 0) > index * 20 ? "lit" : ""}
                />
              ))}
            </div>
          </div>
          {(error || stale) && (
            <p className="guide-status" role="status">
              {error ||
                "위치 정보가 오래됐어요. 내 위치 버튼으로 다시 확인해주세요."}
            </p>
          )}
          <p className="guide-north">
            지도 위쪽이 북쪽 · 약 5초 간격으로 안내해요
          </p>
          <div className="guide-actions">
            <button
              className="button dark"
              disabled={disabled || busy || !current?.withinRange}
              onClick={onClaim}
            >
              <LocateFixed size={16} />
              {busy
                ? "보물을 확인하고 있어요…"
                : current?.withinRange
                  ? "여기서 보물 찾기"
                  : "조금 더 가까이 가볼까요?"}
            </button>
            <button
              className="button guide-stop"
              onClick={onStop}
              aria-label="탐색 멈추기"
            >
              <Pause size={17} />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="guide-start-copy">
            위치를 켜고 걸어보세요. 방향과 탐험 온도가 보물에 가까워지는 길을
            알려줘요.
          </p>
          <button
            className="button dark full"
            onClick={onStart}
            disabled={disabled}
          >
            <Compass size={17} />큰 지도에서 탐색 시작
          </button>
        </>
      )}
      <button
        className="button ar-guide-button"
        onClick={onAr}
        disabled={disabled || busy}
      >
        <Camera size={17} />
        카메라 AR로 찾기
      </button>
    </section>
  );
}
