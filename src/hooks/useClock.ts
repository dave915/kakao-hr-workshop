import { useEffect, useState } from "react";

/** Keep time local to the screen that needs it; refresh immediately on return. */
export function useClock(period: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const time = Date.now();
      setNow(time);
      timer = setTimeout(tick, period - (time % period));
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [period]);
  return now;
}
