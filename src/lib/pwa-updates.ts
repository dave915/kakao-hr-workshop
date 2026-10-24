const UPDATE_INTERVAL = 60_000;

export function watchAppUpdates(
  registrationPromise: Promise<ServiceWorkerRegistration>,
) {
  const workers = navigator.serviceWorker;
  let controlled = Boolean(workers.controller);
  let reloading = false;
  let stopped = false;
  let checking = false;
  let registration: ServiceWorkerRegistration | undefined;
  let installing: ServiceWorker | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const controllerChanged = () => {
    if (!workers.controller) return;
    // The first installation already serves the current app; only reload updates.
    if (!controlled) {
      controlled = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  const activateWaiting = () => {
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  };
  const installed = () => {
    if (installing?.state === "installed") activateWaiting();
  };
  const updateFound = () => {
    installing?.removeEventListener("statechange", installed);
    installing = registration?.installing ?? null;
    installing?.addEventListener("statechange", installed);
    installed();
  };
  const check = () => {
    if (
      !registration ||
      checking ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    )
      return;
    activateWaiting();
    checking = true;
    void registration
      .update()
      .catch(() => {
        // Keep the cached app usable and retry when the connection returns.
      })
      .finally(() => {
        checking = false;
      });
  };

  // Listen before registration resolves so a fast activation cannot be missed.
  workers.addEventListener("controllerchange", controllerChanged);
  void registrationPromise
    .then((reg) => {
      if (stopped) return;
      registration = reg;
      reg.addEventListener("updatefound", updateFound);
      updateFound();
      activateWaiting();
      window.addEventListener("focus", check);
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", check);
      timer = setInterval(check, UPDATE_INTERVAL);
      check();
    })
    .catch(() => {
      // Registration errors are reported by the app's offline-status message.
    });

  return () => {
    stopped = true;
    workers.removeEventListener("controllerchange", controllerChanged);
    registration?.removeEventListener("updatefound", updateFound);
    installing?.removeEventListener("statechange", installed);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
    if (timer !== undefined) clearInterval(timer);
  };
}
