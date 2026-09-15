import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  LocateFixed,
  Map,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { hasCoordinates } from "../../shared/exploration";
import { registrationValues } from "../../shared/treasure-registration";
import type { Position, Treasure } from "../../shared/types";
import { useWorkshop } from "../lib/store";
import { englishName, errorMessage } from "../lib/utils";
import { locate } from "../hooks/useExploration";
import {
  draftHasCoordinates,
  draftStorageKey,
  emptyWorkspace,
  newDraft,
  nextTreasureName,
  parseWorkspace,
  validateDraft,
  type DraftWorkspace,
  type TreasureDraft,
} from "../lib/treasure-drafts";
import TreasurePlacementMap, {
  type PlacementPin,
} from "./TreasurePlacementMap";
import type { Notify } from "./common";

interface Props {
  busy: boolean;
  notify: Notify;
  onDelete: (treasure: Treasure) => void;
}
export default function TreasureManager(props: Props) {
  const { state, me, demo } = useWorkshop();
  if (!state || !me) return null;
  const scope = draftStorageKey(
    demo ? "demo" : import.meta.env.VITE_FIREBASE_PROJECT_ID || "live",
    me.id,
    state.resetGeneration ?? 0,
  );
  return <RegistrationEditor key={scope} {...props} scope={scope} />;
}
function RegistrationEditor({
  busy,
  notify,
  onDelete,
  scope,
}: Props & { scope: string }) {
  const { state: currentState, secrets, act } = useWorkshop();
  const state = currentState!;
  const [initial] = useState(() => {
    try {
      return {
        workspace: parseWorkspace(localStorage.getItem(scope)),
        error: "",
      };
    } catch {
      return {
        workspace: emptyWorkspace(),
        error:
          "이 브라우저의 초안을 불러오지 못했어요. 새 입력은 화면에 보관되지만 브라우저 저장 설정을 확인해주세요.",
      };
    }
  });
  const [workspace, setWorkspace] = useState(initial.workspace);
  const workspaceRef = useRef(workspace);
  const [storageError, setStorageError] = useState(initial.error);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [locating, setLocating] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [placement, setPlacement] = useState<"browse" | "add" | "move">(
    workspace.mode === "map" ? "add" : "browse",
  );
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    key: number;
  } | null>(null);
  const [discard, setDiscard] = useState<string | null>(null);
  const mounted = useRef(true);
  const locationRequest = useRef(0);
  const editor = useRef<HTMLDivElement>(null);
  const disabled = busy || saving;
  const registered = state.treasures.filter(hasCoordinates);
  const selected = workspace.drafts.find((t) => t.id === workspace.selected);
  const selectedSaved = registered.find((t) => t.id === workspace.selected);
  const allItems = [...registered, ...workspace.drafts];
  const total = new Set(allItems.map((t) => t.id)).size;

  useEffect(() => {
    mounted.current = true;
    // Reset generations and user scopes keep old workshop drafts from being restored.
    try {
      const prefix = scope.slice(0, scope.lastIndexOf(":") + 1);
      Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix) && key !== scope)
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      /* A blocked storage surface is reported when saving the next edit. */
    }
    return () => {
      mounted.current = false;
      locationRequest.current++;
    };
  }, [scope]);
  function commit(
    change: DraftWorkspace | ((previous: DraftWorkspace) => DraftWorkspace),
  ) {
    const next =
      typeof change === "function" ? change(workspaceRef.current) : change;
    workspaceRef.current = next;
    setWorkspace(next);
    // Write every edit, including incomplete fields, before navigation or reload.
    try {
      localStorage.setItem(scope, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "브라우저에 초안을 저장하지 못했어요. 입력은 이 화면에 남아 있어요. 저장 전에는 화면을 닫지 마세요.",
      );
    }
  }
  function cancelLocation() {
    locationRequest.current++;
    setLocating(false);
  }
  function pan(lat: number, lng: number) {
    setFocus({ lat, lng, key: Date.now() + Math.random() });
  }
  function append(draft: TreasureDraft, focusPin = true) {
    if (total >= 100 || workspaceRef.current.drafts.length >= 100) {
      setError("보물은 초안을 포함해 최대 100개까지 등록할 수 있어요.");
      return;
    }
    commit((w) => ({ ...w, drafts: [...w.drafts, draft], selected: draft.id }));
    setError("");
    setDiscard(null);
    if (focusPin && draftHasCoordinates(draft)) pan(draft.lat, draft.lng);
  }
  function add(lat: number, lng: number) {
    append(newDraft(allItems, workspaceRef.current.defaults, lat, lng), false);
  }
  function update(id: string, patch: Partial<TreasureDraft>) {
    if (disabled) return;
    commit((w) => {
      const draft = w.drafts.find((t) => t.id === id);
      if (!draft) return w;
      const next = { ...draft, ...patch };
      return {
        ...w,
        drafts: w.drafts.map((t) => (t.id === id ? next : t)),
        defaults: {
          kind: next.kind,
          points:
            next.points !== null &&
            Number.isInteger(next.points) &&
            next.points >= 10 &&
            next.points <= 1000
              ? next.points
              : w.defaults.points,
          radius:
            next.radius !== null &&
            Number.isInteger(next.radius) &&
            next.radius >= 10 &&
            next.radius <= 200
              ? next.radius
              : w.defaults.radius,
        },
      };
    });
    setError("");
  }
  function select(id: string, scroll = false) {
    if (disabled) return;
    cancelLocation();
    setDiscard(null);
    setPlacement("browse");
    setError("");
    const existing = workspaceRef.current.drafts.find((t) => t.id === id);
    const treasure = registered.find((t) => t.id === id);
    if (!existing && treasure && !treasure.foundBy) {
      const kind = secrets[id];
      if (!kind) {
        setError("보물 종류를 불러오는 중이에요. 잠시 후 다시 선택해주세요.");
        return;
      }
      const original = registrationValues(treasure, kind);
      commit((w) => ({
        ...w,
        drafts: [...w.drafts, { ...original, original }],
        selected: id,
      }));
    } else commit((w) => ({ ...w, selected: id }));
    const target = existing ?? treasure;
    if (
      target &&
      target.lat !== null &&
      target.lng !== null &&
      Math.abs(target.lat) <= 90 &&
      Math.abs(target.lng) <= 180
    )
      pan(target.lat, target.lng);
    if (scroll)
      editor.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function locateFor(intent: "add" | "move" | "view") {
    if (disabled || locating) return;
    const request = ++locationRequest.current;
    const selectedId = workspaceRef.current.selected;
    setLocating(true);
    setError("");
    try {
      const here = await locate();
      if (!mounted.current || request !== locationRequest.current) return;
      setPosition(here);
      pan(here.lat, here.lng);
      if (!Number.isFinite(here.accuracy) || here.accuracy > 100)
        throw new Error(
          "GPS 오차가 100m보다 커요. 탁 트인 곳에서 다시 시도하거나 지도에서 위치를 지정해주세요.",
        );
      if (intent === "add") {
        const draft = newDraft(
          [...registered, ...workspaceRef.current.drafts],
          workspaceRef.current.defaults,
          here.lat,
          here.lng,
        );
        append({ ...draft, gpsAccuracy: Math.round(here.accuracy) });
      } else if (intent === "move" && selectedId)
        update(selectedId, {
          lat: here.lat,
          lng: here.lng,
          gpsAccuracy: Math.round(here.accuracy),
        });
      setPlacement("browse");
    } catch (e) {
      if (mounted.current && request === locationRequest.current)
        setError(errorMessage(e));
    } finally {
      if (mounted.current && request === locationRequest.current)
        setLocating(false);
    }
  }
  function duplicate(source: TreasureDraft | Treasure) {
    cancelLocation();
    const kind =
      "kind" in source ? source.kind : (secrets[source.id] ?? source.outcome);
    if (!kind) {
      setError("보물 종류를 불러오는 중이에요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const draft: TreasureDraft = {
      id: crypto.randomUUID(),
      name: /^보물\s*\d+$/.test(source.name)
        ? nextTreasureName(allItems)
        : source.name,
      hint: source.hint,
      lat: source.lat,
      lng: source.lng,
      kind,
      points: source.points,
      radius: source.radius,
    };
    append(draft);
    setPlacement("move");
    notify("새 초안으로 복제했어요. 지도에서 숨길 위치를 바꿀 수 있어요.");
  }
  async function save(items: TreasureDraft[]) {
    if (disabled || savingRef.current || !items.length) return;
    cancelLocation();
    setDiscard(null);
    setError("");
    const values = [];
    for (const item of items) {
      const result = validateDraft(item);
      if (result.error) {
        commit((w) => ({ ...w, selected: item.id }));
        setError(`‘${item.name || "이름 없는 보물"}’: ${result.error}`);
        editor.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        return;
      }
      values.push(result.value!);
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await act({
        action: "saveTreasures",
        treasures: values,
        resetGeneration: state.resetGeneration ?? 0,
      });
      if (!mounted.current) return;
      const ids = new Set(items.map((t) => t.id));
      commit((w) => ({
        ...w,
        drafts: w.drafts.filter((t) => !ids.has(t.id)),
        selected: ids.has(w.selected ?? "") ? null : w.selected,
      }));
      setPlacement(workspaceRef.current.mode === "map" ? "add" : "browse");
      notify(
        `${items.length}개 보물을 저장했어요.${workspaceRef.current.mode === "onsite" ? " 다음 장소에서 현재 위치에 등록을 눌러주세요." : ""}`,
      );
    } catch (e) {
      if (mounted.current)
        setError(`${errorMessage(e)} 초안은 그대로 남아 있어요.`);
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const pins: PlacementPin[] = registered
    .filter(
      (t) => !workspace.drafts.some((draft) => draft.id === t.id) || t.foundBy,
    )
    .map((t, i) => ({
      id: t.id,
      lat: t.lat,
      lng: t.lng,
      number: i + 1,
      draft: false,
      found: Boolean(t.foundBy),
      bomb: secrets[t.id] === "bomb",
    }));
  workspace.drafts.forEach((t, i) => {
    const saved = registered.find((r) => r.id === t.id);
    if (draftHasCoordinates(t) && !saved?.foundBy && (!t.original || saved))
      pins.push({
        id: t.id,
        lat: t.lat,
        lng: t.lng,
        number: i + 1,
        draft: true,
        found: false,
        bomb: t.kind === "bomb",
      });
  });
  const conflict =
    selected?.original && (!selectedSaved || selectedSaved.foundBy);

  return (
    <section className="treasure-manager">
      <div className="section-heading">
        <div>
          <h2>보물 등록</h2>
          <p>현장에서 하나씩, 지도에서 여러 개씩 숨겨보세요.</p>
        </div>
        <span className="mini-tag">등록 {registered.length} / 100</span>
      </div>
      <div className="registration-modes" aria-label="보물 등록 방식">
        <button
          aria-pressed={workspace.mode === "onsite"}
          disabled={disabled}
          onClick={() => {
            cancelLocation();
            commit((w) => ({ ...w, mode: "onsite" }));
            setPlacement("browse");
          }}
        >
          <LocateFixed size={20} />
          <span>
            현장에서 등록<small>현재 위치로 하나씩</small>
          </span>
        </button>
        <button
          aria-pressed={workspace.mode === "map"}
          disabled={disabled}
          onClick={() => {
            cancelLocation();
            commit((w) => ({ ...w, mode: "map" }));
            setPlacement("add");
          }}
        >
          <Map size={20} />
          <span>
            지도에서 배치<small>핀을 놓고 한 번에 저장</small>
          </span>
        </button>
      </div>
      <div className="registration-workspace">
        <div className="registration-map-column">
          <div className="registration-toolbar">
            {workspace.mode === "onsite" ? (
              <button
                className="button dark"
                disabled={disabled || locating || total >= 100}
                onClick={() => void locateFor("add")}
              >
                <LocateFixed size={18} />
                {locating ? "내 위치 확인 중…" : "현재 위치에 등록"}
              </button>
            ) : (
              <button
                className="button dark"
                aria-pressed={placement === "add"}
                disabled={disabled || total >= 100}
                onClick={() => {
                  cancelLocation();
                  setPlacement(placement === "add" ? "browse" : "add");
                }}
              >
                <Plus size={18} />
                {placement === "add" ? "핀 추가 중" : "핀 추가"}
              </button>
            )}
            <button
              className="text-button"
              disabled={disabled || locating || total >= 100}
              onClick={() => {
                cancelLocation();
                append({
                  ...newDraft(allItems, workspace.defaults, 0, 0),
                  lat: null,
                  lng: null,
                });
                setPlacement("move");
              }}
            >
              좌표로 입력
            </button>
          </div>
          <p className="placement-instruction" role="status">
            {placement === "move"
              ? "지도의 새 위치를 누르거나 노란 핀을 끌어서 옮겨주세요."
              : placement === "add"
                ? "지도를 누를 때마다 초안 핀이 추가돼요. 핀은 끌어서 옮길 수 있어요."
                : workspace.mode === "onsite"
                  ? "숨길 장소에서 현재 위치에 등록을 누르고 핀을 확인해주세요."
                  : "지도를 움직여 둘러보거나, 핀을 눌러 내용을 수정하세요."}
          </p>
          {placement !== "browse" && (
            <button
              className="text-button placement-stop"
              disabled={disabled}
              onClick={() => setPlacement("browse")}
            >
              <Check size={15} />
              위치 선택 마치기
            </button>
          )}
          <TreasurePlacementMap
            initialViewport={
              workspace.viewport ?? {
                lat: state.settings.center[0],
                lng: state.settings.center[1],
                level: 3,
              }
            }
            pins={pins}
            selected={workspace.selected}
            radius={selected?.radius ?? selectedSaved?.radius ?? null}
            position={position}
            focus={focus}
            placing={placement !== "browse"}
            disabled={disabled}
            locating={locating}
            onPlace={(lat, lng) => {
              cancelLocation();
              if (placement === "move" && selected) {
                update(selected.id, { lat, lng, gpsAccuracy: undefined });
                setPlacement("browse");
              } else if (placement === "add") add(lat, lng);
            }}
            onSelect={(id) => select(id)}
            onMove={(id, lat, lng) => {
              cancelLocation();
              update(id, { lat, lng, gpsAccuracy: undefined });
              commit((w) => ({ ...w, selected: id }));
              setPlacement("browse");
            }}
            onLocate={() => void locateFor("view")}
            onViewport={(viewport) => commit((w) => ({ ...w, viewport }))}
          />
        </div>
        <div className="registration-editor" ref={editor}>
          <div className="draft-heading">
            <h3>
              작성 중 <span>{workspace.drafts.length}</span>
            </h3>
            <small>
              {storageError ? "화면에 보관 중" : "이 브라우저에 자동 보관"}
            </small>
          </div>
          {storageError && (
            <p className="registration-error" role="alert">
              {storageError}
            </p>
          )}
          {workspace.drafts.length > 0 && (
            <div className="draft-tabs" aria-label="보물 초안 목록">
              {workspace.drafts.map((t, i) => (
                <button
                  key={t.id}
                  disabled={disabled}
                  aria-pressed={t.id === workspace.selected}
                  onClick={() => select(t.id)}
                >
                  <b>{i + 1}</b>
                  <span>{t.name || "이름 없는 보물"}</span>
                  {t.original && <small>수정</small>}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="registration-error" role="alert">
              {error}
            </p>
          )}
          {selected ? (
            <form
              className="form-stack registration-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save([selected]);
              }}
            >
              <fieldset disabled={disabled}>
                <div className="draft-title">
                  <span className="mini-tag">
                    {selected.original ? "등록한 보물 수정" : "새 보물 초안"}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="선택한 초안 버리기"
                    onClick={() => setDiscard(selected.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {discard === selected.id && (
                  <div className="draft-discard">
                    <p>이 초안의 입력 내용을 버릴까요?</p>
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => {
                        cancelLocation();
                        commit((w) => ({
                          ...w,
                          drafts: w.drafts.filter((t) => t.id !== selected.id),
                          selected: null,
                        }));
                        setDiscard(null);
                        setError("");
                        setPlacement("browse");
                      }}
                    >
                      초안 버리기
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setDiscard(null)}
                    >
                      계속 작성
                    </button>
                  </div>
                )}
                {conflict && (
                  <p className="registration-error" role="alert">
                    원본이 발견되거나 삭제되었어요. 이 초안은 저장할 수 없어요.
                    복제하면 새 보물로 만들 수 있어요.
                  </p>
                )}
                <label>
                  보물 이름
                  <input
                    name="name"
                    value={selected.name}
                    maxLength={80}
                    onChange={(event) =>
                      update(selected.id, { name: event.target.value })
                    }
                  />
                </label>
                <label>
                  작은 힌트
                  <textarea
                    name="hint"
                    value={selected.hint}
                    maxLength={300}
                    rows={3}
                    placeholder="예: 벤치 옆 커다란 나무 아래를 찾아보세요."
                    onChange={(event) =>
                      update(selected.id, { hint: event.target.value })
                    }
                  />
                </label>
                <label>
                  숨길 선물
                  <select
                    name="kind"
                    value={selected.kind}
                    onChange={(event) =>
                      update(selected.id, {
                        kind: event.target.value as TreasureDraft["kind"],
                      })
                    }
                  >
                    <option value="treasure">보물 · 포인트 획득</option>
                    <option value="bomb">꽝 · 탐험 5분 휴식</option>
                  </select>
                </label>
                <div className="draft-location">
                  <MapPin size={18} />
                  <div>
                    <strong>
                      {draftHasCoordinates(selected)
                        ? "선택한 핀 위치에 숨겨요"
                        : "위치를 지정해주세요"}
                    </strong>
                    <small>
                      {selected.gpsAccuracy !== undefined
                        ? `GPS 오차 ±${selected.gpsAccuracy}m · 지도에서 핀을 확인해주세요`
                        : "지도에 표시한 원 안에서 카메라로 획득해요"}
                    </small>
                    <div className="draft-location-actions">
                      <button
                        type="button"
                        className="text-button"
                        disabled={Boolean(conflict)}
                        onClick={() => {
                          cancelLocation();
                          setPlacement("move");
                          document
                            .querySelector(".registration-map-column")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }}
                      >
                        지도에서 위치 바꾸기
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={locating || Boolean(conflict)}
                        onClick={() => void locateFor("move")}
                      >
                        {locating ? "확인 중…" : "내 위치로"}
                      </button>
                    </div>
                  </div>
                </div>
                <DraftDetails
                  key={selected.id}
                  initialOpen={!draftHasCoordinates(selected)}
                >
                  <summary>
                    상세 설정{" "}
                    <span>
                      {selected.kind === "treasure"
                        ? `${selected.points ?? "—"}P · `
                        : ""}
                      반경 {selected.radius ?? "—"}m
                    </span>
                  </summary>
                  <div className="registration-details">
                    <div className="form-pair">
                      {selected.kind === "treasure" && (
                        <label>
                          포인트
                          <input
                            name="points"
                            type="number"
                            value={selected.points ?? ""}
                            onChange={(event) =>
                              update(selected.id, {
                                points:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      )}
                      <label>
                        발견 반경 (m)
                        <input
                          name="radius"
                          type="number"
                          value={selected.radius ?? ""}
                          onChange={(event) =>
                            update(selected.id, {
                              radius:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="form-pair">
                      <label>
                        위도
                        <input
                          name="lat"
                          type="number"
                          step="any"
                          value={selected.lat ?? ""}
                          onChange={(event) =>
                            update(selected.id, {
                              lat:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                              gpsAccuracy: undefined,
                            })
                          }
                        />
                      </label>
                      <label>
                        경도
                        <input
                          name="lng"
                          type="number"
                          step="any"
                          value={selected.lng ?? ""}
                          onChange={(event) =>
                            update(selected.id, {
                              lng:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                              gpsAccuracy: undefined,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      disabled={!draftHasCoordinates(selected)}
                      onClick={() => {
                        if (draftHasCoordinates(selected))
                          pan(selected.lat, selected.lng);
                      }}
                    >
                      입력한 좌표를 지도에서 보기
                    </button>
                  </div>
                </DraftDetails>
                <p className="footnote">
                  종류는 발견 전까지 비밀이에요. 이름과 힌트에 꽝인지 적지
                  마세요.
                </p>
                <div className="draft-save-actions">
                  <button
                    className="button dark"
                    disabled={Boolean(conflict) || locating}
                  >
                    <Save size={17} />
                    {saving
                      ? "저장 중…"
                      : workspace.mode === "onsite"
                        ? "저장하고 다음"
                        : "이 보물 저장"}
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={total >= 100}
                    onClick={() => duplicate(selected)}
                  >
                    <Copy size={17} />
                    복제
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="registration-empty">
              {selectedSaved?.foundBy ? (
                <>
                  <Check size={28} />
                  <h3>이미 발견한 보물이에요</h3>
                  <p>
                    ‘{selectedSaved.name}’은 수정할 수 없어요. 복제하면 같은
                    내용으로 새 보물을 등록할 수 있어요.
                  </p>
                  <button
                    className="button"
                    disabled={disabled || total >= 100}
                    onClick={() => duplicate(selectedSaved)}
                  >
                    <Copy size={17} />새 보물로 복제
                  </button>
                </>
              ) : (
                <>
                  <MapPin size={28} />
                  <h3>
                    {workspace.drafts.length
                      ? "초안을 선택해주세요"
                      : "숨길 장소부터 골라볼까요?"}
                  </h3>
                  <p>
                    {workspace.mode === "onsite"
                      ? "현재 위치에 등록을 누르면 이름이 자동으로 채워져요. 힌트만 더하면 준비 끝!"
                      : "지도에 핀을 여러 개 놓고, 각 초안의 힌트를 채워주세요."}
                  </p>
                </>
              )}
            </div>
          )}
          {workspace.drafts.length > 0 && (
            <div className="draft-batch">
              <span>저장 전에는 참가자에게 보이지 않아요.</span>
              <button
                className="button dark full"
                disabled={disabled || locating}
                onClick={() => void save(workspace.drafts)}
              >
                <Save size={17} />
                {saving
                  ? "저장 중…"
                  : `초안 ${workspace.drafts.length}개 모두 저장`}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="registered-heading">
        <h3>
          등록한 보물 <span>{registered.length}</span>
        </h3>
        <p>수정하거나 복제해서 빠르게 추가할 수 있어요.</p>
      </div>
      <div className="admin-item-list treasure-admin-list registration-saved-list">
        {registered.length === 0 && (
          <p className="muted">
            아직 등록한 보물이 없어요. 첫 번째 장소를 골라주세요.
          </p>
        )}
        {registered.map((t) => (
          <article key={t.id}>
            <span
              className={`mini-tag ${secrets[t.id] === "bomb" || t.outcome === "bomb" ? "orange" : "green"}`}
            >
              {secrets[t.id] === "bomb" || t.outcome === "bomb" ? "꽝" : "보물"}
            </span>
            <div>
              <h3>{t.name}</h3>
              <p>
                {t.foundBy
                  ? `${englishName(state.members[t.foundBy]?.handle, "삭제된 참가자")} · 발견`
                  : `${t.points}P · 반경 ${t.radius}m`}
              </p>
            </div>
            <div className="registered-actions">
              <button
                className="icon-button"
                aria-label={`${t.name} 수정`}
                disabled={disabled || Boolean(t.foundBy)}
                onClick={() => select(t.id, true)}
              >
                <Pencil size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={`${t.name} 복제`}
                disabled={disabled || total >= 100}
                onClick={() => {
                  duplicate(t);
                  editor.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }}
              >
                <Copy size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={`${t.name} 삭제`}
                disabled={disabled}
                onClick={() => onDelete(t)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DraftDetails({
  initialOpen,
  children,
}: {
  initialOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {children}
    </details>
  );
}
