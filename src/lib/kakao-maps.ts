/** The subset of the official Kakao Maps Web SDK used by this app. */
export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
export interface KakaoMap {
  getCenter(): KakaoLatLng;
  setCenter(center: KakaoLatLng): void;
  panTo(center: KakaoLatLng): void;
  getLevel(): number;
  setLevel(level: number): void;
  setMinLevel(level: number): void;
  setMaxLevel(level: number): void;
  setDraggable(enabled: boolean): void;
  setZoomable(enabled: boolean): void;
  relayout(): void;
}
export interface KakaoOverlay {
  setMap(map: KakaoMap | null): void;
}
export interface KakaoMapClick {
  latLng: KakaoLatLng;
}
export interface KakaoMaps {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: {
      center: KakaoLatLng;
      level: number;
      scrollwheel?: boolean;
      keyboardShortcuts?: boolean;
    },
  ) => KakaoMap;
  CustomOverlay: new (options: {
    map: KakaoMap;
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    clickable?: boolean;
    zIndex?: number;
  }) => KakaoOverlay;
  Circle: new (options: {
    center: KakaoLatLng;
    radius: number;
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity?: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoOverlay;
  event: {
    addListener(
      target: KakaoMap,
      type: "dragstart",
      callback: () => void,
    ): void;
    removeListener(
      target: KakaoMap,
      type: "dragstart",
      callback: () => void,
    ): void;
    addListener(
      target: KakaoMap,
      type: "click",
      callback: (event: KakaoMapClick) => void,
    ): void;
    removeListener(
      target: KakaoMap,
      type: "click",
      callback: (event: KakaoMapClick) => void,
    ): void;
    preventMap(): void;
  };
}
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}
export const kakaoMapConfigured = Boolean(
  import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim(),
);
let pending: Promise<KakaoMaps> | null = null;

/** Share one SDK load between participant/admin maps and React StrictMode mounts. */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
  const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim();
  if (!appKey)
    return Promise.reject(new Error("카카오맵 연결 정보를 준비하고 있어요."));
  if (pending) return pending;

  pending = new Promise<KakaoMaps>((resolve, reject) => {
    let finished = false;
    let script: HTMLScriptElement | null = null;
    const clean = () => {
      clearTimeout(timer);
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      clean();
      script?.remove();
      reject(
        new Error(
          "카카오맵을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.",
        ),
      );
    };
    const ready = () => {
      if (finished) return;
      if (!window.kakao?.maps?.Map) {
        fail();
        return;
      }
      finished = true;
      clean();
      resolve(window.kakao.maps);
    };
    const load = () => {
      try {
        if (!window.kakao?.maps?.load) {
          fail();
          return;
        }
        window.kakao.maps.load(ready);
      } catch {
        fail();
      }
    };
    const timer = setTimeout(fail, 15000);
    if (window.kakao?.maps?.load) {
      load();
      return;
    }
    script = document.createElement("script");
    script.id = "workshop-kakao-map-sdk";
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?${new URLSearchParams({ appkey: appKey, autoload: "false" })}`;
    script.onload = load;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
