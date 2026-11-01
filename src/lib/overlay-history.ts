const stateKey = "__workshopOverlay";

interface OverlayEntry {
  session: string;
  url: string;
  depth: number;
  ids: number[];
  baseState: unknown;
  scrollRestoration: History["scrollRestoration"];
}

interface HistoryHost {
  history: Pick<
    History,
    "state" | "pushState" | "replaceState" | "go" | "scrollRestoration"
  >;
  location: Pick<Location, "href">;
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
}

function readEntry(state: unknown): OverlayEntry | undefined {
  if (!state || typeof state !== "object" || !(stateKey in state)) return;
  const entry = (state as Record<string, unknown>)[stateKey] as OverlayEntry;
  if (
    entry &&
    typeof entry.session === "string" &&
    typeof entry.url === "string" &&
    Number.isInteger(entry.depth) &&
    entry.depth > 0 &&
    Array.isArray(entry.ids) &&
    entry.ids.length === entry.depth
  )
    return entry;
}

/** One same-URL history entry per overlay, shared by dialogs and subviews. */
export function createOverlayHistory(host: HistoryHost) {
  const session = crypto.randomUUID();
  const layers: { id: number; url: string; dismiss: () => void }[] = [];
  const afterClose: (() => void)[] = [];
  let nextId = 0;
  let queued = false;
  let traversing = false;
  let disposed = false;
  let scrollRestoration: History["scrollRestoration"] | undefined;
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;

  function restoreScrollPolicy() {
    if (scrollRestoration === undefined) return;
    host.history.scrollRestoration = scrollRestoration;
    scrollRestoration = undefined;
  }

  function schedule() {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) reconcile();
    });
  }

  function reconcile() {
    if (traversing) return;
    const current = readEntry(host.history.state);
    const entry =
      current?.session === session && current.url === host.location.href
        ? current
        : undefined;
    const active = layers.filter((layer) => layer.url === host.location.href);
    const depth = entry?.depth ?? 0;
    const baseState = current ? current.baseState : host.history.state;

    // Cleanup is deferred to coalesce StrictMode and modal-to-modal transitions.
    // Never traverse a new route just because its old dialog unmounted.
    if (active.length < depth) {
      traversing = true;
      host.history.go(active.length - depth);
      return;
    }

    const stateAt = (count: number) => ({
      ...(baseState && typeof baseState === "object" ? baseState : {}),
      [stateKey]: {
        session,
        url: host.location.href,
        depth: count,
        ids: active.slice(0, count).map((layer) => layer.id),
        baseState,
        scrollRestoration: scrollRestoration ?? host.history.scrollRestoration,
      } satisfies OverlayEntry,
    });
    if (depth && entry?.ids.some((id, index) => id !== active[index]?.id))
      host.history.replaceState(stateAt(depth), "", host.location.href);
    else if (current && !entry)
      host.history.replaceState(baseState, "", host.location.href);
    for (let count = depth + 1; count <= active.length; count++)
      host.history.pushState(stateAt(count), "", host.location.href);

    if (!active.length && !layers.length) {
      // Native restoration runs after popstate. Let the scroll lock restore the
      // feed position first, and restore browser defaults in the next task.
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(restoreScrollPolicy, 0);
      const callbacks = afterClose.splice(0);
      callbacks.forEach((callback) => callback());
    }
  }

  function pop() {
    if (traversing) {
      traversing = false;
      schedule();
      return;
    }
    const entry = readEntry(host.history.state);
    const remaining = new Set(
      entry?.session === session && entry.url === host.location.href
        ? entry.ids
        : [],
    );
    // A closed dialog is not resurrected by Forward or by restoring an old tab.
    if (entry && !layers.length) {
      host.history.replaceState(entry.baseState, "", host.location.href);
      host.history.scrollRestoration = entry.scrollRestoration;
      return;
    }
    for (const layer of [...layers].reverse()) {
      if (!remaining.has(layer.id)) layer.dismiss();
    }
    // A busy dialog may refuse dismissal. Give it its history entry back.
    schedule();
  }

  host.addEventListener("popstate", pop);
  return {
    register(dismiss: () => void) {
      clearTimeout(restoreTimer);
      scrollRestoration ??=
        readEntry(host.history.state)?.scrollRestoration ??
        host.history.scrollRestoration;
      // Set this before the body becomes fixed so the base entry also uses it.
      host.history.scrollRestoration = "manual";
      const layer = { id: ++nextId, url: host.location.href, dismiss };
      layers.push(layer);
      schedule();
      return () => {
        const index = layers.indexOf(layer);
        if (index !== -1) layers.splice(index, 1);
        schedule();
      };
    },
    afterClose(callback: () => void) {
      if (!layers.length && !traversing && !readEntry(host.history.state))
        callback();
      else {
        afterClose.push(callback);
        schedule();
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(restoreTimer);
      restoreScrollPolicy();
      host.removeEventListener("popstate", pop);
    },
  };
}

let manager: ReturnType<typeof createOverlayHistory> | undefined;
export function overlayHistory() {
  return (manager ??= createOverlayHistory(window));
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    manager?.dispose();
  });
