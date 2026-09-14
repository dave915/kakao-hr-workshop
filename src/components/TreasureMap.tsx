import { useEffect, useRef, useState } from "react";
import { LocateFixed, Plus, Minus, MapPin, RefreshCw } from "lucide-react";
import type { Position, Treasure, TreasureSecrets } from "../../shared/types";
import {
  kakaoMapConfigured,
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMaps,
  type KakaoMapClick,
  type KakaoOverlay,
} from "../lib/kakao-maps";
interface Props {
  treasures: Treasure[];
  center: [number, number];
  selected: string | null;
  onSelect: (id: string) => void;
  position: Position | null;
  onLocate: () => void;
  onPlace?: (lat: number, lng: number) => void;
  secrets?: TreasureSecrets;
  showFound?: boolean;
  locationName: string;
}
const NO_SECRETS: TreasureSecrets = {};
export default function TreasureMap({
  treasures,
  center,
  selected,
  onSelect,
  position,
  onLocate,
  onPlace,
  secrets = NO_SECRETS,
  showFound = true,
  locationName,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onPlace, center });
  callbacks.current = { onSelect, onPlace, center };
  const [context, setContext] = useState<{
    map: KakaoMap;
    sdk: KakaoMaps;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let cleanMap: (() => void) | undefined;
    setContext(null);
    setError("");
    void loadKakaoMaps()
      .then((sdk) => {
        if (cancelled) return;
        const [lat, lng] = callbacks.current.center;
        const map = new sdk.Map(container, {
          center: new sdk.LatLng(lat, lng),
          level: 3,
          // Kakao uses this option for both wheel and multi-touch pinch zoom.
          scrollwheel: true,
          keyboardShortcuts: true,
        });
        map.setMinLevel(1);
        map.setMaxLevel(14);
        const place = (event: KakaoMapClick) =>
          callbacks.current.onPlace?.(
            event.latLng.getLat(),
            event.latLng.getLng(),
          );
        sdk.event.addListener(map, "click", place);
        observer = new ResizeObserver(() => {
          // Preserve the viewport when a drawer, resize or device rotation changes the container.
          const current = map.getCenter();
          map.relayout();
          map.setCenter(current);
        });
        observer.observe(container);
        cleanMap = () => {
          sdk.event.removeListener(map, "click", place);
          map.setDraggable(false);
          map.setZoomable(false);
          container.replaceChildren();
        };
        setContext({ map, sdk });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "카카오맵을 불러오지 못했어요.",
          );
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      cleanMap?.();
    };
  }, [attempt]);
  useEffect(() => {
    if (!context) return;
    context.map.setCenter(new context.sdk.LatLng(center[0], center[1]));
    context.map.setLevel(3);
  }, [context, center[0], center[1]]);
  useEffect(() => {
    if (!context || !position) return;
    // Every fresh GPS fix re-centers, even if its coordinates have not changed.
    context.map.setLevel(2);
    context.map.setCenter(new context.sdk.LatLng(position.lat, position.lng));
  }, [context, position?.lat, position?.lng, position?.timestamp]);
  useEffect(() => {
    if (!context) return;
    const { map, sdk } = context;
    const overlays: KakaoOverlay[] = [];
    for (const t of treasures) {
      if (t.foundBy && !showFound) continue;
      const found = Boolean(t.foundBy);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-marker-root";
      button.setAttribute(
        "aria-label",
        found ? `${t.name} · 발견 완료` : t.name,
      );
      button.setAttribute("aria-pressed", String(selected === t.id));
      button.title = found ? `${t.name} · 발견 완료` : t.name;
      const pin = document.createElement("span");
      pin.className = `map-marker ${found ? "found" : ""} ${selected === t.id ? "selected" : ""}`;
      pin.setAttribute("aria-hidden", "true");
      const symbol = document.createElement("span");
      symbol.className = "map-marker-symbol";
      symbol.textContent = found ? "×" : secrets[t.id] === "bomb" ? "?" : "✦";
      pin.appendChild(symbol);
      button.appendChild(pin);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        sdk.event.preventMap();
        callbacks.current.onSelect(t.id);
      });
      overlays.push(
        new sdk.CustomOverlay({
          map,
          position: new sdk.LatLng(t.lat, t.lng),
          content: button,
          xAnchor: 0.5,
          yAnchor: 1,
          clickable: true,
          zIndex: selected === t.id ? 10 : found ? 1 : 2,
        }),
      );
    }
    if (position) {
      const location = new sdk.LatLng(position.lat, position.lng);
      const accuracyCircle = new sdk.Circle({
        center: location,
        radius: Math.min(position.accuracy, 100),
        strokeWeight: 1,
        strokeColor: "#477357",
        fillColor: "#477357",
        fillOpacity: 0.12,
      });
      accuracyCircle.setMap(map);
      overlays.push(accuracyCircle);
      const dot = document.createElement("span");
      dot.className = "map-current-position";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "내 위치");
      overlays.push(
        new sdk.CustomOverlay({
          map,
          position: location,
          content: dot,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 20,
        }),
      );
    }
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [context, treasures, selected, position, secrets, showFound]);
  const selectedTreasure = treasures.find(
    (treasure) => treasure.id === selected,
  );
  useEffect(() => {
    if (!context || !selectedTreasure) return;
    // A treasure chosen from the list may be outside the initial workshop view.
    const destination = new context.sdk.LatLng(
      selectedTreasure.lat,
      selectedTreasure.lng,
    );
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      context.map.setCenter(destination);
    else context.map.panTo(destination);
  }, [context, selectedTreasure?.lat, selectedTreasure?.lng]);
  const zoom = (delta: number) => {
    if (context)
      context.map.setLevel(
        Math.max(1, Math.min(14, context.map.getLevel() + delta)),
      );
  };
  return (
    <div
      className={`map-container ${onPlace ? "map-placing" : ""}`}
      aria-busy={!context && !error}
    >
      <div
        ref={root}
        className="kakao-map-canvas"
        aria-label="카카오맵 보물 위치 지도"
      />
      {!context && (
        <div className="map-state" role={error ? "alert" : "status"}>
          <MapPin size={27} />
          <strong>{error || "카카오맵을 펼치고 있어요…"}</strong>
          {error && <p>아래 보물 목록은 계속 확인할 수 있어요.</p>}
          {error && kakaoMapConfigured && (
            <button
              className="button small"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshCw size={15} />
              다시 불러오기
            </button>
          )}
        </div>
      )}
      <span className="map-location">
        <MapPin size={14} />
        {onPlace ? "지도를 눌러 보물 위치 선택" : locationName}
      </span>
      <div className="map-tools">
        <button
          aria-label="지도 확대"
          disabled={!context}
          onClick={() => zoom(-1)}
        >
          <Plus size={20} />
        </button>
        <button
          aria-label="지도 축소"
          disabled={!context}
          onClick={() => zoom(1)}
        >
          <Minus size={20} />
        </button>
        <button
          aria-label="내 위치로 이동"
          disabled={!context}
          onClick={onLocate}
        >
          <LocateFixed size={20} />
        </button>
      </div>
      {context && (
        <div className="map-legend">
          <span>
            <i />
            숨겨진 보물
          </span>
          <span>
            <i className="found" />
            발견 완료
          </span>
          <span>
            <i className="me" />내 위치
          </span>
        </div>
      )}
    </div>
  );
}
