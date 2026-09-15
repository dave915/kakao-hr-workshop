import { ArrowUp, Check, Compass, Sparkles, Maximize2 } from "lucide-react";
import type { ReactNode } from "react";
import { compassDirection, directionMatch } from "../../shared/ar";

interface Props {
  heading?: number | null;
  bearing?: number | null;
  withinRange?: boolean;
  waiting?: boolean;
  error?: string;
  onEnable?: () => void;
  onExpand?: () => void;
  children?: ReactNode;
}
export default function DirectionCompass({
  heading,
  bearing,
  withinRange,
  waiting,
  error,
  onEnable,
  onExpand,
  children,
}: Props) {
  const live = Boolean(onEnable);
  const match = live ? directionMatch(bearing, heading) : null;
  const hasHeading = heading != null && Number.isFinite(heading);
  const hasBearing = bearing != null && Number.isFinite(bearing);
  return (
    <div
      className={`guide-reading direction-comparison ${live ? "is-live-comparison" : ""} ${match?.aligned ? "is-aligned" : ""} ${onExpand ? "is-expandable" : ""}`}
      aria-label={live ? "내 방향과 보물 방향 비교" : "보물 방향 안내"}
    >
      {onExpand && (
        <button
          className="compass-expand-hit"
          onClick={onExpand}
          aria-label="나침반 힌트 크게 보기"
        >
          <span>
            <Maximize2 size={12} />
            크게 보기
          </span>
        </button>
      )}
      <div
        className={`direction-beacon ${live ? "is-live" : ""} ${!live && waiting ? "waiting" : ""}`}
        aria-hidden="true"
      >
        {live && hasBearing && (
          <span
            className="compass-target"
            style={{ transform: `rotate(${bearing}deg)` }}
          />
        )}
        {live && hasHeading ? (
          <ArrowUp size={40} style={{ transform: `rotate(${heading}deg)` }} />
        ) : !live && withinRange ? (
          <Sparkles size={38} />
        ) : !live && hasBearing ? (
          <ArrowUp size={40} style={{ transform: `rotate(${bearing}deg)` }} />
        ) : (
          <Compass size={36} />
        )}
        {match?.aligned && (
          <span className="compass-match-check">
            <Check size={13} />
          </span>
        )}
      </div>
      <div className="compass-content">
        {live && (
          <div className="compass-readings">
            <span className="compass-me-label">
              내 방향
              <strong>
                {hasHeading
                  ? `${compassDirection(heading)} ${Math.round(heading) % 360}°`
                  : "방향 확인 대기"}
              </strong>
            </span>
            {hasBearing && (
              <span className="compass-target-label">
                보물 방향
                <strong>
                  {compassDirection(bearing)} {Math.round(bearing) % 360}°
                </strong>
              </span>
            )}
          </div>
        )}
        {children}
        {match && (
          <p className="compass-match-status" role="status">
            {match.aligned ? (
              <>
                <Check size={15} />
                방향이 맞아요
              </>
            ) : match.difference < 0 ? (
              "왼쪽으로 조금 돌려보세요"
            ) : (
              "오른쪽으로 조금 돌려보세요"
            )}
          </p>
        )}
        {live && !hasHeading && (
          <div className="compass-reconnect">
            <button className="text-button" onClick={onEnable}>
              <Compass size={15} />
              방향 켜기
            </button>
            <p role="status">
              {error || "방향을 켜면 보물 방향과 맞춰볼 수 있어요."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
