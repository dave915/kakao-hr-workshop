import { lazy, Suspense, useState, useRef } from "react";
import {
  Camera as CameraIcon,
  Compass,
  Gift,
  LocateFixed,
  MapPin,
  Timer,
  X,
  PartyPopper,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import { distanceMeters, remainingTreasures } from "../../shared/game";
import type { ClaimResult, Position } from "../../shared/types";
import { errorMessage } from "../lib/utils";
import { Drawer, Empty, type Notify } from "./common";
import { TreasureIllustration } from "./ExpeditionArt";
const TreasureMap = lazy(() => import("./TreasureMap"));
const Camera = lazy(() => import("./Camera"));
export function locate(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("위치 확인을 지원하지 않는 브라우저예요."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "브라우저 설정에서 위치 권한을 허용해주세요."
              : "위치를 확인하지 못했어요. 야외에서 다시 시도해주세요.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
export default function Treasure({
  notify,
  now,
}: {
  notify: Notify;
  now: number;
}) {
  const { state, me, act, demo } = useWorkshop();
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFound, setShowFound] = useState(true);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selectTreasure = (id: string) => {
    setSelected(id);
    if (innerWidth <= 1000)
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({
          block: "nearest",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        }),
      );
  };
  if (!state || !me) return null;
  const treasure = state.treasures.find((t) => t.id === selected);
  const locked = me.blockedUntil > now;
  const seconds = Math.max(0, Math.ceil((me.blockedUntil - now) / 1000));
  const onLocate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setPosition(await locate());
      notify("현재 위치로 지도를 이동했어요.");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const claim = async (simulate = false) => {
    if (!treasure || busy) return;
    setBusy(true);
    try {
      const p =
        simulate && demo
          ? {
              lat: treasure.lat,
              lng: treasure.lng,
              accuracy: 5,
              timestamp: Date.now(),
            }
          : await locate();
      setPosition(p);
      const r = await act({
        action: "claim",
        treasureId: treasure.id,
        position: p,
      });
      setResult(r.result ?? null);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">THE TREASURE HUNT</span>
          <h1>발걸음 끝에, 뜻밖의 행운</h1>
          <p>지도의 반짝임을 따라 나만의 보물을 발견해요.</p>
        </div>
        <span className="outline-pill">
          <span
            className={`status-dot ${state.settings.gameOpen ? "" : "gray"}`}
          />
          {state.settings.gameOpen ? "탐험 진행 중" : "탐험 준비 중"}
        </span>
      </div>
      {locked && (
        <div className="lock-banner" role="status">
          <Timer size={25} />
          <div>
            <strong>앗, 꽝! 잠깐 숨을 골라요.</strong>
            <p>
              다시 탐험할 때까지 {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, "0")} · 일정과 공지는 계속 볼 수
              있어요.
            </p>
          </div>
        </div>
      )}
      <div className="map-toolbar">
        <span>
          <Gift size={18} />
          남은 보물 <strong>
            {remainingTreasures(state.treasures)}
          </strong> / {state.treasures.length}
        </span>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showFound}
            onChange={(e) => setShowFound(e.target.checked)}
          />
          발견한 보물 표시
        </label>
        <button
          className="button small"
          onClick={() => setCamera(true)}
          disabled={locked}
        >
          <CameraIcon size={16} />
          카메라로 보기
        </button>
      </div>
      <Suspense
        fallback={<div className="map-loading">탐험 지도를 펼치고 있어요…</div>}
      >
        <TreasureMap
          treasures={state.treasures}
          center={state.settings.center}
          selected={selected}
          onSelect={selectTreasure}
          position={position}
          onLocate={() => void onLocate()}
          showFound={showFound}
          locationName={state.settings.location}
        />
      </Suspense>
      <div className="treasure-bottom">
        <section className="treasure-list">
          <h2>
            탐험할 곳을 골라보세요 <Compass size={20} />
          </h2>
          {state.treasures
            .filter((t) => showFound || !t.foundBy)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => selectTreasure(t.id)}
                className={`treasure-list-item ${selected === t.id ? "selected" : ""} ${t.foundBy ? "found" : ""}`}
              >
                <span className="treasure-mini-icon">
                  {t.foundBy ? <X size={19} /> : <Gift size={20} />}
                </span>
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    {t.foundBy
                      ? `${state.members[t.foundBy]?.name ?? "탐험대원"}님이 발견했어요`
                      : position
                        ? `약 ${Math.round(distanceMeters(position, t))}m 거리`
                        : "위치를 켜면 거리가 보여요"}
                  </small>
                </span>
                <span>{t.foundBy ? "발견 완료" : `${t.points} P`}</span>
              </button>
            ))}
        </section>
        <section ref={detailRef} className="treasure-detail">
          {treasure ? (
            <>
              <span className="mini-tag green">EXPLORER’S NOTE</span>
              <h2>{treasure.name}</h2>
              <p className="treasure-hint">{treasure.hint}</p>
              <div className="detail-meta">
                <span>
                  <MapPin size={15} />
                  반경 {treasure.radius}m 이내
                </span>
                <span>
                  <Gift size={15} />
                  {treasure.points} 포인트
                </span>
              </div>
              {treasure.foundBy ? (
                <div className="found-message">
                  {state.members[treasure.foundBy]?.name}님이 발견한{" "}
                  {treasure.outcome === "bomb" ? "꽝" : "보물"}이에요.
                </div>
              ) : (
                <>
                  <button
                    className="button dark full"
                    disabled={
                      busy ||
                      locked ||
                      !state.settings.gameOpen ||
                      !navigator.onLine
                    }
                    onClick={() => void claim()}
                  >
                    <LocateFixed size={17} />
                    {busy ? "위치를 확인하고 있어요…" : "여기서 보물 찾기"}
                  </button>
                  {demo && (
                    <button
                      className="text-button demo-claim"
                      disabled={busy || locked || !state.settings.gameOpen}
                      onClick={() => void claim(true)}
                    >
                      미리보기: 이 위치에서 발견 체험
                    </button>
                  )}
                </>
              )}
              <p className="footnote">
                가까이 도착해 버튼을 눌러주세요. 선착순 한 명만 발견할 수 있고,
                꽝이면 5분간 쉬어가요.
              </p>
            </>
          ) : (
            <Empty
              title="어떤 길로 떠나볼까요?"
              body="지도나 목록에서 보물을 선택하면 작은 힌트가 나타나요."
            />
          )}
        </section>
      </div>
      {camera && (
        <Drawer title="카메라로 둘러보기" onClose={() => setCamera(false)}>
          <Suspense fallback={<p>카메라를 준비하고 있어요…</p>}>
            <Camera />
          </Suspense>
        </Drawer>
      )}
      {result && (
        <Drawer
          title={
            result.outcome === "bomb"
              ? "앗, 깜짝 선물이었어요!"
              : "새로운 보물을 발견했어요!"
          }
          onClose={() => setResult(null)}
        >
          <div className={`result-view ${result.outcome}`}>
            <TreasureIllustration bomb={result.outcome === "bomb"} />
            <h2>
              {result.outcome === "bomb"
                ? "5분 동안 잠깐 쉬어가요"
                : `+${result.points} 포인트!`}
            </h2>
            <p>
              {result.outcome === "bomb"
                ? "잠깐의 쉼도 모험의 일부니까요. 휴식 후 다시 도전해요."
                : "우리 팀의 탐험 수첩에도 기록했어요. 다음 행운을 찾아 떠나볼까요?"}
            </p>
            <button className="button dark" onClick={() => setResult(null)}>
              {result.outcome === "bomb" ? "알겠어요" : "다음 모험으로"}
              <PartyPopper size={17} />
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
