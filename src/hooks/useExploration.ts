import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionInput } from "../../shared/validation";
import type {
  ActionResponse,
  Position,
  TreasureGuidance,
} from "../../shared/types";
import { approachTrend } from "../../shared/exploration";
import { errorMessage } from "../lib/utils";
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
export function useExploration(
  act: (input: ActionInput) => Promise<ActionResponse>,
) {
  const [target, setTarget] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [guidance, setGuidance] = useState<TreasureGuidance | null>(null);
  const [trend, setTrend] = useState<"closer" | "farther" | "steady">("steady");
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [follow, setFollow] = useState(true);
  const generation = useRef(0);
  const latest = useRef<Position | null>(null);
  const previous = useRef<TreasureGuidance | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    setTarget(null);
    setWaiting(false);
  }, []);
  const start = useCallback((id: string) => {
    generation.current++;
    setGuidance(null);
    previous.current = null;
    latest.current = null;
    setError("");
    setTrend("steady");
    setFollow(true);
    setWaiting(true);
    setTarget(id);
  }, []);
  const refresh = useCallback(async () => {
    const p = await locate();
    latest.current = p;
    setPosition(p);
    setFollow(true);
    setError("");
    return p;
  }, []);
  useEffect(() => {
    if (!target) return;
    const run = ++generation.current;
    let watch: number | undefined;
    let inFlight = false,
      lastRequest = 0,
      lastTimestamp = 0;
    const pump = async () => {
      const p = latest.current;
      if (
        document.hidden ||
        !navigator.onLine ||
        inFlight ||
        !p ||
        p.timestamp === lastTimestamp ||
        Date.now() - p.timestamp > 20000 ||
        Date.now() - lastRequest < 5000
      )
        return;
      if (p.accuracy <= 0 || p.accuracy > 100) {
        setError("위치가 정확하지 않아요. 탁 트인 곳에서 다시 확인해주세요.");
        setWaiting(false);
        return;
      }
      inFlight = true;
      lastRequest = Date.now();
      lastTimestamp = p.timestamp;
      try {
        const result = await act({
          action: "getGuidance",
          treasureId: target,
          position: p,
        });
        if (run !== generation.current) return;
        if (result.guidance) {
          const nextTrend = approachTrend(
            previous.current,
            result.guidance,
            p.accuracy,
          );
          setTrend(nextTrend);
          if (!previous.current || nextTrend !== "steady")
            previous.current = result.guidance;
          setGuidance(result.guidance);
          setError("");
        }
      } catch (e) {
        if (run === generation.current) {
          setError(errorMessage(e));
          setGuidance(null);
          lastTimestamp = 0;
        }
      } finally {
        inFlight = false;
        if (run === generation.current) setWaiting(false);
      }
    };
    if (!navigator.geolocation) {
      setError("위치를 지원하지 않는 브라우저예요.");
      setWaiting(false);
      return;
    }
    watch = navigator.geolocation.watchPosition(
      (p) => {
        if (run !== generation.current) return;
        const point = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        };
        latest.current = point;
        setPosition(point);
        void pump();
      },
      (e) => {
        if (run !== generation.current) return;
        setError(
          e.code === 1
            ? "위치 권한을 허용해야 방향을 안내할 수 있어요."
            : "위치를 다시 확인하고 있어요. 야외에서 잠시 기다려주세요.",
        );
        setGuidance(null);
        setWaiting(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 },
    );
    const interval = setInterval(() => void pump(), 1000);
    return () => {
      generation.current++;
      clearInterval(interval);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
    };
  }, [target, act]);
  return {
    target,
    position,
    setPosition,
    guidance,
    trend,
    error,
    waiting,
    follow,
    setFollow,
    start,
    stop,
    refresh,
  };
}
