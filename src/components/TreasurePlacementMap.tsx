import { useEffect, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, RefreshCw } from "lucide-react";
import {
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMaps,
  type KakaoMapClick,
} from "../lib/kakao-maps";
import type { MapViewport } from "../lib/treasure-drafts";
import type { Position } from "../../shared/types";
import { errorMessage } from "../lib/utils";

export interface PlacementPin {
  id: string;
  lat: number;
  lng: number;
  number: number;
  draft: boolean;
  found: boolean;
  bomb: boolean;
}
interface Props {
  initialViewport: MapViewport;
  pins: PlacementPin[];
  selected: string | null;
  radius: number | null;
  position: Position | null;
  focus: { lat: number; lng: number; key: number } | null;
  placing: boolean;
  disabled: boolean;
  locating: boolean;
  onPlace: (lat: number, lng: number) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, lat: number, lng: number) => void;
  onLocate: () => void;
  onViewport: (viewport: MapViewport) => void;
}
export default function TreasurePlacementMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const initial = useRef(props.initialViewport);
  const draggedAt = useRef(0);
  const [context, setContext] = useState<{
    maps: KakaoMaps;
    map: KakaoMap;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !container.current) return;
        const { lat, lng, level } = initial.current;
        const map = new maps.Map(container.current, {
          center: new maps.LatLng(lat, lng),
          level,
          scrollwheel: true,
          keyboardShortcuts: true,
        });
        const click = (event: KakaoMapClick) => {
          if (
            callbacks.current.disabled ||
            !callbacks.current.placing ||
            Date.now() - draggedAt.current < 350
          )
            return;
          callbacks.current.onPlace(
            event.latLng.getLat(),
            event.latLng.getLng(),
          );
        };
        const idle = () => {
          const center = map.getCenter();
          callbacks.current.onViewport({
            lat: center.getLat(),
            lng: center.getLng(),
            level: map.getLevel(),
          });
        };
        maps.event.addListener(map, "click", click);
        maps.event.addListener(map, "idle", idle);
        const observer = new ResizeObserver(() => {
          const center = map.getCenter();
          map.relayout();
          map.setCenter(center);
        });
        observer.observe(container.current);
        cleanup = () => {
          observer.disconnect();
          maps.event.removeListener(map, "click", click);
          maps.event.removeListener(map, "idle", idle);
        };
        setContext({ maps, map });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [attempt]);

  const pinKey = JSON.stringify(props.pins);
  useEffect(() => {
    if (!context) return;
    const { maps, map } = context;
    const pins = JSON.parse(pinKey) as PlacementPin[];
    const cleanups = pins.map((pin) => {
      const selected = pin.id === props.selected;
      const color = pin.found ? "#72786a" : pin.draft ? "#f5d84c" : "#476953";
      const ink = pin.draft ? "#26372b" : "#ffffff";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path d="M22 49L8 33C-7 16 4 3 22 3s29 13 14 30z" fill="${color}" stroke="${selected ? "#253b2e" : "#ffffff"}" stroke-width="${selected ? 4 : 2}"/><text x="22" y="28" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="${ink}">${pin.found ? "✓" : pin.number}</text></svg>`;
      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(pin.lat, pin.lng),
        image: new maps.MarkerImage(
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          new maps.Size(44, 52),
          { offset: new maps.Point(22, 50) },
        ),
        title: `${pin.draft ? "초안" : "등록된 보물"} ${pin.number}`,
        draggable: pin.draft && !pin.found && !props.disabled,
        zIndex: selected ? 5 : pin.draft ? 3 : 1,
      });
      const click = () => {
        draggedAt.current = Date.now();
        if (!callbacks.current.disabled) callbacks.current.onSelect(pin.id);
      };
      const dragStart = () => {
        draggedAt.current = Date.now();
      };
      const dragEnd = () => {
        draggedAt.current = Date.now();
        const position = marker.getPosition();
        if (!callbacks.current.disabled)
          callbacks.current.onMove(
            pin.id,
            position.getLat(),
            position.getLng(),
          );
      };
      maps.event.addListener(marker, "click", click);
      maps.event.addListener(marker, "dragstart", dragStart);
      maps.event.addListener(marker, "dragend", dragEnd);
      return () => {
        maps.event.removeListener(marker, "click", click);
        maps.event.removeListener(marker, "dragstart", dragStart);
        maps.event.removeListener(marker, "dragend", dragEnd);
        marker.setMap(null);
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [context, pinKey, props.selected, props.disabled]);

  const selectedPin = props.pins.find((p) => p.id === props.selected);
  const lat = selectedPin?.lat,
    lng = selectedPin?.lng;
  useEffect(() => {
    if (
      !context ||
      lat === undefined ||
      lng === undefined ||
      !props.radius ||
      props.radius < 10 ||
      props.radius > 200
    )
      return;
    const { map, maps } = context;
    const circle = new maps.Circle({
      center: new maps.LatLng(lat, lng),
      radius: props.radius,
      strokeWeight: 2,
      strokeColor: "#476953",
      fillColor: "#8aa071",
      fillOpacity: 0.15,
    });
    circle.setMap(map);
    return () => circle.setMap(null);
  }, [context, lat, lng, props.radius]);
  useEffect(() => {
    if (!context || !props.position) return;
    const { map, maps } = context;
    const dot = document.createElement("div");
    dot.className = "placement-location-dot";
    dot.title = "현재 내 위치";
    const position = new maps.LatLng(props.position.lat, props.position.lng);
    const overlay = new maps.CustomOverlay({
      map,
      position,
      content: dot,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 4,
    });
    return () => overlay.setMap(null);
  }, [context, props.position]);
  useEffect(() => {
    if (context && props.focus)
      context.map.panTo(
        new context.maps.LatLng(props.focus.lat, props.focus.lng),
      );
  }, [context, props.focus]);

  return (
    <div className={`placement-map ${props.placing ? "is-placing" : ""}`}>
      <div
        ref={container}
        className="placement-map-canvas"
        aria-label="보물 배치 지도"
      />
      {!context && (
        <div className="placement-map-status" role="status">
          <p>{error || "지도를 펼치고 있어요…"}</p>
          {error && (
            <button
              className="button"
              onClick={() => {
                setError("");
                setAttempt((v) => v + 1);
              }}
            >
              <RefreshCw size={16} />
              다시 불러오기
            </button>
          )}
        </div>
      )}
      {context && (
        <>
          <div className="placement-map-tools">
            <button
              className="icon-button"
              aria-label="지도 확대"
              onClick={() =>
                context.map.setLevel(Math.max(1, context.map.getLevel() - 1))
              }
            >
              <Plus size={20} />
            </button>
            <button
              className="icon-button"
              aria-label="지도 축소"
              onClick={() =>
                context.map.setLevel(Math.min(14, context.map.getLevel() + 1))
              }
            >
              <Minus size={20} />
            </button>
            <button
              className="icon-button"
              aria-label="지도를 내 위치로"
              disabled={props.locating || props.disabled}
              onClick={props.onLocate}
            >
              <LocateFixed size={20} />
            </button>
          </div>
          <div className="placement-map-legend">
            <span>
              <i className="draft" />
              초안
            </span>
            <span>
              <i />
              등록됨
            </span>
            <span>✓ 발견 완료</span>
          </div>
        </>
      )}
    </div>
  );
}
