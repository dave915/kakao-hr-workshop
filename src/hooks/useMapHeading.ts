import { useEffect, useState } from "react";
import { mapHeading } from "../../shared/ar";
import { useDevicePose } from "./useDevicePose";
const screenAngle = () =>
  screen.orientation?.angle ??
  (window as Window & { orientation?: number }).orientation ??
  0;

export function useMapHeading(active: boolean, now: number) {
  const sensor = useDevicePose();
  const [angle, setAngle] = useState(screenAngle);
  useEffect(() => {
    if (!active) {
      sensor.stop();
      return;
    }
    const rotate = () => setAngle(screenAngle());
    const pause = () => {
      if (document.hidden) sensor.stop();
    };
    rotate();
    window.addEventListener("orientationchange", rotate);
    screen.orientation?.addEventListener("change", rotate);
    document.addEventListener("visibilitychange", pause);
    return () => {
      window.removeEventListener("orientationchange", rotate);
      screen.orientation?.removeEventListener("change", rotate);
      document.removeEventListener("visibilitychange", pause);
      sensor.stop();
    };
  }, [active, sensor.stop]);
  const fresh = sensor.pose && Math.abs(now - sensor.pose.updatedAt) < 3000;
  return {
    heading: active && fresh ? mapHeading(sensor.pose!, angle) : null,
    error: active ? sensor.error : "",
    start: sensor.start,
  };
}
