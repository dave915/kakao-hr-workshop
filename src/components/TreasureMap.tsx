import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Plus, Minus, MapPin } from "lucide-react";
import type { Position, Treasure, TreasureSecrets } from "../../shared/types";
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
export default function TreasureMap({
  treasures,
  center,
  selected,
  onSelect,
  position,
  onLocate,
  onPlace,
  secrets = {},
  showFound = true,
  locationName,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onPlace });
  callbacks.current = { onSelect, onPlace };
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    const m = L.map(root.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView(center, 16);
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    })
      .on("tileerror", () => setTileError(true))
      .addTo(m);
    layers.current = L.layerGroup().addTo(m);
    m.on("click", (e) =>
      callbacks.current.onPlace?.(e.latlng.lat, e.latlng.lng),
    );
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(root.current);
    setReady(true);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
    // Only create the map once; viewport updates are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready) map.current?.setView(center, 16);
  }, [center[0], center[1], ready]);
  useEffect(() => {
    if (ready && position)
      map.current?.setView([position.lat, position.lng], 17, {
        animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
  }, [position?.lat, position?.lng, position?.timestamp, ready]);
  useEffect(() => {
    if (!ready || !layers.current) return;
    const layer = layers.current;
    layer.clearLayers();
    for (const t of treasures) {
      if (t.foundBy && !showFound) continue;
      const found = Boolean(t.foundBy);
      const bomb = secrets[t.id] === "bomb";
      L.marker([t.lat, t.lng], {
        title: found ? `${t.name} · 발견 완료` : t.name,
        alt: t.name,
        keyboard: true,
        icon: L.divIcon({
          className: "map-marker-root",
          html: `<span class="map-marker ${found ? "found" : ""} ${selected === t.id ? "selected" : ""}">${found ? "×" : bomb ? "?" : "✦"}</span>`,
          iconSize: [40, 48],
          iconAnchor: [20, 44],
        }),
      })
        .on("click", () => callbacks.current.onSelect(t.id))
        .addTo(layer)
        .getElement()
        ?.setAttribute("aria-label", found ? `${t.name} · 발견 완료` : t.name);
    }
    if (position) {
      L.circle([position.lat, position.lng], {
        radius: Math.min(position.accuracy, 100),
        color: "#477357",
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(layer);
      L.circleMarker([position.lat, position.lng], {
        radius: 7,
        fillColor: "#477357",
        fillOpacity: 1,
        color: "#faf9f3",
        weight: 3,
      }).addTo(layer);
    }
  }, [treasures, selected, position, secrets, showFound, ready]);
  return (
    <div className={`map-container ${onPlace ? "map-placing" : ""}`}>
      <div ref={root} className="leaflet-canvas" aria-label="보물 위치 지도" />
      <span className="map-location">
        <MapPin size={14} />
        {onPlace ? "지도를 눌러 보물 위치 선택" : locationName}
      </span>
      <div className="map-tools">
        <button aria-label="지도 확대" onClick={() => map.current?.zoomIn()}>
          <Plus size={20} />
        </button>
        <button aria-label="지도 축소" onClick={() => map.current?.zoomOut()}>
          <Minus size={20} />
        </button>
        <button aria-label="내 위치로 이동" onClick={onLocate}>
          <LocateFixed size={20} />
        </button>
      </div>
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
      {tileError && (
        <p className="map-warning">
          배경 지도를 불러오지 못했어요. 보물 목록은 계속 볼 수 있어요.
        </p>
      )}
    </div>
  );
}
