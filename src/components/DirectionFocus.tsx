import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Camera,
  Check,
  Compass,
  LocateFixed,
  Map,
  Sparkles,
} from "lucide-react";
import { continuousRotation, directionMatch } from "../../shared/ar";
import type { TreasureGuidance, VisibleTreasure } from "../../shared/types";
export default function DirectionFocus({
  treasure,
  guidance,
  heading,
  error,
  headingError,
  accuracy,
  disabled,
  busy,
  onEnable,
  onLocate,
  onAr,
  onMap,
}: {
  treasure: VisibleTreasure;
  guidance: TreasureGuidance | null;
  heading: number | null;
  error: string;
  headingError: string;
  accuracy?: number;
  disabled: boolean;
  busy: boolean;
  onEnable: () => void;
  onLocate: () => void;
  onAr: () => void;
  onMap: () => void;
}) {
  const current = disabled ? null : guidance;
  const match =
    current && !current.withinRange
      ? directionMatch(current.bearing, heading)
      : null;
  const [rotation, setRotation] = useState(match?.difference ?? 0);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  useEffect(() => {
    if (match)
      setRotation((previous) => continuousRotation(previous, match.difference));
  }, [match?.difference]);
  const arrived = Boolean(current?.withinRange);
  const aligned = Boolean(match?.aligned);
  const status = !current
    ? "위치를 확인하고 있어요"
    : arrived
      ? "주변에 보물이 있어요"
      : !match
        ? "휴대폰 방향을 켜주세요"
        : aligned
          ? "방향이 맞아요"
          : Math.abs(match.difference) > 135
            ? "뒤쪽을 향해 돌아보세요"
            : match.difference < 0
              ? "왼쪽으로 돌아보세요"
              : "오른쪽으로 돌아보세요";
  const distance = current
    ? current.distance >= 1000
      ? (current.distance / 1000).toFixed(1)
      : String(current.distance)
    : "—";
  return (
    <section
      className={`direction-focus ${aligned || arrived ? "is-aligned" : ""}`}
      aria-label="보물 방향 크게 보기"
    >
      <div className="direction-focus-intro">
        <span className="eyebrow">
          {arrived ? "YOU’RE CLOSE" : "FOLLOW YOUR COMPASS"}
        </span>
        <h2 ref={title} tabIndex={-1}>
          {status}
        </h2>
        <p>
          {!current
            ? error || "GPS가 잡히면 보물까지의 길을 알려드려요."
            : arrived
              ? "천천히 주변을 살피고 카메라로 찾아보세요."
              : !match
                ? headingError || "휴대폰을 돌려 화살표를 위로 맞춰보세요."
                : aligned
                  ? "휴대폰이 보물을 향하고 있어요."
                  : "화살표가 위를 향하도록 휴대폰을 돌려주세요."}
        </p>
      </div>
      <div className="direction-focus-instrument" aria-hidden="true">
        <div className="direction-focus-north" />
        {arrived ? (
          <Sparkles className="direction-focus-arrived" />
        ) : match ? (
          <ArrowUp
            className="direction-focus-arrow"
            strokeWidth={2.4}
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        ) : (
          <Compass className="direction-focus-waiting" strokeWidth={1.2} />
        )}
      </div>
      <div className="direction-focus-distance">
        <span>{current ? "보물까지 약" : "위치 확인 중"}</span>
        <strong>
          {distance}
          {current && <small>{current.distance >= 1000 ? "km" : "m"}</small>}
        </strong>
        <div className="direction-focus-signal">
          {aligned ? (
            <>
              <Check size={18} />이 방향이에요
            </>
          ) : arrived ? (
            "발견 가능 범위"
          ) : current ? (
            "GPS 기준의 대략적인 거리예요"
          ) : (
            "정확한 위치를 기다리고 있어요"
          )}
        </div>
      </div>
      <div className="direction-focus-bottom">
        <p className="direction-focus-clue">{treasure.hint}</p>
        <div className="direction-focus-actions">
          {current && heading === null && !arrived && (
            <button className="button dark" onClick={onEnable}>
              <Compass size={18} />
              방향 켜기
            </button>
          )}
          {!current && (
            <button className="button dark" onClick={onLocate}>
              <LocateFixed size={18} />
              위치 다시 확인
            </button>
          )}
          {arrived && (
            <button
              className="button dark"
              disabled={disabled || busy}
              onClick={onAr}
            >
              <Camera size={18} />
              {busy ? "카메라 준비 중…" : "카메라 켜고 찾기"}
            </button>
          )}
          <button className="button" onClick={onMap}>
            <Map size={17} />
            지도 보기
          </button>
        </div>
        <small>
          {accuracy && Number.isFinite(accuracy)
            ? `GPS 오차 ±${Math.round(accuracy)}m · `
            : ""}
          주변과 발밑을 살피며 이동해주세요.
        </small>
      </div>
    </section>
  );
}
