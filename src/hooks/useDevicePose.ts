import { useCallback, useEffect, useRef, useState } from "react";
import {
  devicePose,
  type DevicePose,
  type OrientationReading,
} from "../../shared/ar";

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
};

export function useDevicePose() {
  const [pose, setPose] = useState<DevicePose | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const cleanup = useRef<() => void>(() => {});
  const stop = useCallback(() => {
    generation.current++;
    cleanup.current();
    cleanup.current = () => {};
    setPose(null);
  }, []);
  const start = useCallback(async () => {
    stop();
    setError("");
    const run = generation.current;
    try {
      const orientation = window.DeviceOrientationEvent as
        OrientationConstructor | undefined;
      if (!orientation)
        throw new Error(
          "방향 센서가 없는 기기예요. 휴대폰에서 열거나 지도 탐색을 이용해주세요.",
        );
      // Called directly from the start button, before awaiting camera/GPS permission.
      if (
        orientation.requestPermission &&
        (await orientation.requestPermission(true)) !== "granted"
      )
        throw new Error("동작 및 방향 권한을 허용해야 AR을 사용할 수 있어요.");
      if (run !== generation.current) return false;
      let frame = 0;
      let latest: DevicePose | null = null;
      let seen = false;
      const listener = (event: DeviceOrientationEvent) => {
        const next = devicePose(event as OrientationReading);
        if (!next) return;
        latest = next;
        seen = true;
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (run === generation.current) {
              setPose(latest);
              setError("");
            }
          });
      };
      window.addEventListener("deviceorientationabsolute", listener);
      window.addEventListener("deviceorientation", listener);
      const timeout = setTimeout(() => {
        if (!seen && run === generation.current)
          setError(
            "북쪽 방향을 확인하지 못했어요. 휴대폰을 8자로 움직인 뒤 다시 켜주세요. 지원되지 않는 브라우저에서는 지도 탐색을 이용해주세요.",
          );
      }, 8000);
      cleanup.current = () => {
        window.removeEventListener("deviceorientationabsolute", listener);
        window.removeEventListener("deviceorientation", listener);
        cancelAnimationFrame(frame);
        clearTimeout(timeout);
      };
      return true;
    } catch (e) {
      if (run === generation.current)
        setError(e instanceof Error ? e.message : "방향 센서를 켜지 못했어요.");
      return false;
    }
  }, [stop]);
  useEffect(
    () => () => {
      generation.current++;
      cleanup.current();
    },
    [],
  );
  return { pose, error, start, stop };
}
