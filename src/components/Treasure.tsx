import { lazy, Suspense, useState, useMemo, useEffect, useRef } from "react";
import {
  Camera as CameraIcon,
  Gift,
  Timer,
  X,
  PartyPopper,
  Maximize2,
  ArrowUpRight,
  Check,
  MapPin,
  LocateFixed,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import { remainingTreasures } from "../../shared/game";
import { hasCoordinates } from "../../shared/exploration";
import type { ClaimResult, Position } from "../../shared/types";
import { englishName, errorMessage } from "../lib/utils";
import { Drawer, Empty, type Notify } from "./common";
import { TreasureIllustration } from "./ExpeditionArt";
import { locate, useExploration } from "../hooks/useExploration";
import { useMapHeading } from "../hooks/useMapHeading";
import ExplorationGuide from "./ExplorationGuide";
import ExplorationDialog from "./ExplorationDialog";
import DirectionCompass from "./DirectionCompass";
import DirectionFocus from "./DirectionFocus";
export { locate } from "../hooks/useExploration";
const TreasureMap = lazy(() => import("./TreasureMap"));
const Camera = lazy(() => import("./Camera"));
export default function Treasure({
  notify,
  now,
}: {
  notify: Notify;
  now: number;
}) {
  const { state, me, act } = useWorkshop();
  const guideRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [directionFocus, setDirectionFocus] = useState(false);
  const [listMode, setListMode] = useState<"clues" | "found">("clues");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const entryLocation = useRef<{
    memberId: string;
    request: Promise<Position>;
  } | null>(null);
  const explore = useExploration(act, "map", expanded);
  const compass = useMapHeading(expanded, now);
  const { setPosition, setFollow } = explore;
  const treasure = state?.treasures.find((t) => t.id === selected);
  const found = useMemo(
    () =>
      state?.treasures
        .filter((t) => Boolean(t.foundBy))
        .filter(hasCoordinates) ?? [],
    [state?.treasures],
  );
  const clues = useMemo(
    () => state?.treasures.filter((t) => !t.foundBy) ?? [],
    [state?.treasures],
  );
  const locked = Boolean(me && me.blockedUntil > now);
  useEffect(() => {
    explore.stop();
    setSelected(null);
    setCamera(false);
    setDirectionFocus(false);
  }, [me?.id]);
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    setPosition(null);
    setFollow(true);
    setLocating(true);
    setLocationError("");
    // Reuse the pending request during StrictMode's effect replay.
    if (entryLocation.current?.memberId !== me.id)
      entryLocation.current = { memberId: me.id, request: locate() };
    void entryLocation.current.request
      .then((position) => {
        if (cancelled) return;
        // A later exploration fix must not be replaced by a slower entry fix.
        setPosition((current) =>
          current && current.timestamp > position.timestamp
            ? current
            : position,
        );
      })
      .catch((e) => {
        if (!cancelled) setLocationError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLocating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me?.id, setPosition, setFollow]);
  useEffect(() => {
    if (
      (explore.target || camera) &&
      (!treasure || treasure.foundBy || locked || !state?.settings.gameOpen)
    ) {
      explore.stop();
      setCamera(false);
      setDirectionFocus(false);
      if (treasure?.foundBy && treasure.foundBy !== me?.id)
        notify("누군가 먼저 발견했어요! 다른 힌트로 탐험을 이어가요.");
    }
  }, [
    treasure?.id,
    treasure?.foundBy,
    locked,
    state?.settings.gameOpen,
    camera,
  ]);
  if (!state || !me) return null;
  const seconds = Math.max(0, Math.ceil((me.blockedUntil - now) / 1000));
  const disabled = locked || !state.settings.gameOpen || !navigator.onLine;
  const stale = Boolean(
    explore.target &&
    explore.guidance &&
    (now - explore.guidance.updatedAt > 30000 ||
      !explore.position ||
      now - explore.position.timestamp > 20000),
  );
  const positionCurrent = Boolean(
    explore.position &&
    Math.abs(now - explore.position.timestamp) <= 20000 &&
    explore.position.accuracy > 0 &&
    explore.position.accuracy <= 100,
  );
  const selectTreasure = (id: string, revealGuide = false) => {
    setDirectionFocus(false);
    if (id !== selected) explore.stop();
    setSelected(id);
    if (revealGuide)
      requestAnimationFrame(() =>
        guideRef.current?.scrollIntoView({
          block: "center",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        }),
      );
  };
  const openLargeMap = () => {
    setDirectionFocus(false);
    explore.setFollow(true);
    setExpanded(true);
    // Start during the tap so Safari can request motion/orientation permission.
    void compass.start();
  };
  const start = () => {
    if (!treasure || disabled) return;
    explore.start(treasure.id);
    openLargeMap();
  };
  const startCamera = () => {
    if (!treasure || treasure.foundBy || disabled) return;
    explore.stop();
    setExpanded(false);
    setDirectionFocus(false);
    setCamera(true);
  };
  const onLocate = async () => {
    explore.setFollow(true);
    setLocating(true);
    setLocationError("");
    try {
      await explore.refresh();
    } catch (e) {
      setLocationError(errorMessage(e));
      notify(errorMessage(e));
    } finally {
      setLocating(false);
    }
  };
  const claimFromCamera = async (
    position: Position,
  ): Promise<string | undefined> => {
    if (!camera || !treasure || busy || disabled)
      return "카메라를 켜고 다시 시도해주세요.";
    setBusy(true);
    try {
      explore.setPosition(position);
      const r = await act({
        action: "claimCamera",
        treasureId: treasure.id,
        position,
      });
      explore.stop();
      setExpanded(false);
      setCamera(false);
      setResult(r.result ?? null);
    } catch (e) {
      notify(errorMessage(e));
      return errorMessage(e);
    } finally {
      setBusy(false);
    }
  };
  const map = (
    <Suspense
      fallback={<div className="map-loading">탐험 지도를 펼치고 있어요…</div>}
    >
      <TreasureMap
        treasures={found}
        foundOnly
        center={state.settings.center}
        selected={treasure?.foundBy ? selected : null}
        onSelect={selectTreasure}
        position={explore.position}
        onLocate={() => void onLocate()}
        followPosition={explore.follow}
        onManualPan={() => explore.setFollow(false)}
        locationName={state.settings.location}
        heading={compass.heading}
        positionCurrent={!expanded || positionCurrent}
      />
    </Suspense>
  );
  const guide = !state.settings.gameOpen ? (
    <section
      className="guide-card guide-not-started"
      role="status"
      aria-label="보물찾기 시작 안내"
    >
      <span className="mini-tag">시작 대기</span>
      <h2>아직 보물찾기 시작 전이에요</h2>
      <p>추진위원회가 보물찾기를 시작하면 힌트를 따라 탐색할 수 있어요.</p>
    </section>
  ) : treasure && !treasure.foundBy ? (
    <ExplorationGuide
      treasure={treasure}
      guidance={
        explore.guidance?.treasureId === treasure.id ? explore.guidance : null
      }
      tracking={explore.target === treasure.id}
      waiting={explore.waiting}
      stale={stale}
      error={explore.error}
      trend={explore.trend}
      disabled={disabled}
      busy={busy}
      onStart={start}
      onStop={explore.stop}
      onAr={startCamera}
      heading={expanded ? compass.heading : undefined}
      headingError={compass.error}
      onEnableHeading={expanded ? () => void compass.start() : undefined}
      onExpandDirection={
        expanded
          ? () => {
              setDirectionFocus(true);
              if (compass.heading === null) void compass.start();
            }
          : undefined
      }
    />
  ) : treasure ? (
    <section className="found-detail">
      <span className="mini-tag green">
        <Check size={13} />
        발견 완료
      </span>
      <h2>{treasure.name}</h2>
      <p>{treasure.hint}</p>
      <strong>
        발견한 사람:{" "}
        {englishName(state.members[treasure.foundBy!]?.handle, "삭제된 참가자")}
      </strong>
      <small>
        {treasure.outcome === "bomb"
          ? "깜짝 꽝이 숨어있던 곳이에요."
          : `${treasure.points} 포인트의 보물이었어요.`}
      </small>
    </section>
  ) : (
    <Empty
      title="정답 대신, 작은 힌트부터"
      body="힌트를 고르면 큰 지도에서 보물을 향한 방향과 가까워지는 정도를 안내해요."
    />
  );
  return (
    <div className="hunt-page page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">FOLLOW THE CLUES</span>
          <h1>보이지 않아 더 설레는 모험</h1>
          <p>힌트를 따라 걸어요. 가까워질수록 탐험 온도가 올라가요.</p>
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
      {!navigator.onLine && (
        <p className="guide-status" role="status">
          오프라인이에요. 힌트는 볼 수 있지만 탐색 안내와 발견에는 연결이
          필요해요.
        </p>
      )}
      <div className="hunt-layout">
        <div className="hunt-map-column">
          <div className="hunt-map-heading">
            <span>
              <MapPin size={16} />
              지도에는 발견한 보물만 표시해요
            </span>
            <button className="text-button" onClick={openLargeMap}>
              <Maximize2 size={16} />
              지도 크게 보기
            </button>
          </div>
          {!expanded && map}
          {!explore.position && (locating || locationError) && (
            <p className="guide-status" role="status">
              {locating
                ? "현재 위치를 확인하고 있어요. 위치 접근을 허용하면 지도가 자동으로 이동해요."
                : locationError}
            </p>
          )}
          <div className="hunt-map-caption">
            <span>
              <Gift size={15} />
              발견 {found.length}개 · 아직 숨겨진 보물{" "}
              {remainingTreasures(state.treasures)}개
            </span>
            <button
              className="text-button"
              onClick={startCamera}
              disabled={disabled || !treasure || Boolean(treasure.foundBy)}
              title={!treasure ? "먼저 보물 힌트를 골라주세요" : undefined}
            >
              <CameraIcon size={15} />
              AR로 찾기
            </button>
          </div>
          {!expanded && <div ref={guideRef}>{guide}</div>}
        </div>
        <aside className="clue-panel">
          <div className="clue-panel-heading">
            <span className="eyebrow">EXPLORER’S NOTEBOOK</span>
            <h2>어떤 힌트를 따라갈까요?</h2>
          </div>
          <div className="segmented">
            <button
              className={listMode === "clues" ? "selected" : ""}
              onClick={() => setListMode("clues")}
            >
              미발견 힌트 {clues.length}
            </button>
            <button
              className={listMode === "found" ? "selected" : ""}
              onClick={() => setListMode("found")}
            >
              발견 기록 {found.length}
            </button>
          </div>
          <div className="clue-list">
            {(listMode === "clues" ? clues : found).map((t, index) => (
              <button
                className={`clue-item ${t.id === selected ? "selected" : ""}`}
                key={t.id}
                onClick={() => selectTreasure(t.id, true)}
                aria-pressed={t.id === selected}
              >
                <span className="clue-number">
                  {t.foundBy ? (
                    <Check size={18} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <span className="clue-item-copy">
                  <strong>{t.name}</strong>
                  <span>{t.hint}</span>
                  <small>
                    {t.foundBy
                      ? `${englishName(state.members[t.foundBy]?.handle, "삭제된 참가자")} · 발견`
                      : `${t.points} P · 힌트로 탐색`}
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
          {(listMode === "clues" ? clues : found).length === 0 && (
            <Empty
              title={
                listMode === "clues"
                  ? "아직 숨겨진 힌트가 없어요"
                  : "첫 발견을 기다리고 있어요"
              }
              body={
                listMode === "clues"
                  ? "새로운 보물이 등록되면 이곳에 힌트가 나타나요."
                  : "누군가 발견하면 지도에도 위치가 나타나요."
              }
            />
          )}
          <p className="footnote">
            미발견 보물의 위치는 비밀이에요. 먼저 발견한 대원만 포인트를 얻을 수
            있어요.
          </p>
        </aside>
      </div>
      {expanded && (
        <ExplorationDialog
          title={treasure?.name ?? "우리의 발견 지도"}
          onClose={() => {
            setExpanded(false);
            setDirectionFocus(false);
          }}
          directionMode={directionFocus}
          onMap={() => {
            setDirectionFocus(false);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>(
                  ".exploration-dialog .compass-expand-hit",
                )
                ?.focus(),
            );
          }}
        >
          <div className="map-exploration-content" hidden={directionFocus}>
            <section className="live-map-status" aria-label="실시간 내 위치">
              <div className="live-map-readings">
                <div className="live-map-location">
                  <LocateFixed size={20} />
                  <span>
                    <strong>
                      {positionCurrent
                        ? "실시간 내 위치"
                        : explore.position
                          ? "위치 갱신 대기"
                          : "위치 확인 중"}
                    </strong>
                    <small>
                      {explore.position
                        ? `GPS 오차 ±${Math.round(explore.position.accuracy)}m · ${explore.follow ? "내 위치 따라가는 중" : "지도 둘러보는 중"}`
                        : "위치 접근을 허용해주세요"}
                    </small>
                  </span>
                </div>
                <button className="text-button" onClick={() => void onLocate()}>
                  <LocateFixed size={15} />내 위치로
                </button>
              </div>
              {!positionCurrent && (explore.error || locationError) && (
                <p role="status">{explore.error || locationError}</p>
              )}
            </section>
            <div className="focus-map-area">{map}</div>
            <div className="focus-guide-area">
              {state.settings.gameOpen &&
                (!treasure ||
                  treasure.foundBy ||
                  explore.target !== treasure.id) && (
                  <DirectionCompass
                    heading={compass.heading}
                    error={compass.error}
                    onEnable={() => void compass.start()}
                  />
                )}
              {guide}
            </div>
          </div>
          {directionFocus && treasure && (
            <DirectionFocus
              treasure={treasure}
              guidance={
                explore.target === treasure.id && !stale && !explore.error
                  ? explore.guidance
                  : null
              }
              heading={compass.heading}
              error={
                explore.error ||
                (stale
                  ? "위치 정보가 오래됐어요. 위치를 다시 확인해주세요."
                  : disabled
                    ? "지금은 탐색을 진행할 수 없어요."
                    : "")
              }
              headingError={compass.error}
              accuracy={explore.position?.accuracy}
              disabled={disabled}
              busy={busy}
              onEnable={() => void compass.start()}
              onLocate={() => void onLocate()}
              onAr={startCamera}
              onMap={() => {
                setDirectionFocus(false);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      ".exploration-dialog .compass-expand-hit",
                    )
                    ?.focus(),
                );
              }}
            />
          )}
        </ExplorationDialog>
      )}
      {camera && treasure && !treasure.foundBy && !disabled && (
        <Suspense fallback={<p role="status">AR 카메라를 준비하고 있어요…</p>}>
          <Camera
            treasure={treasure}
            act={act}
            now={now}
            busy={busy}
            onClaim={claimFromCamera}
            onClose={() => setCamera(false)}
            onMap={() => {
              setCamera(false);
              start();
            }}
          />
        </Suspense>
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
                : "우리 팀의 탐험 수첩에도 기록했어요. 다음 힌트로 모험을 이어가요!"}
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
