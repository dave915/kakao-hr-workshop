import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  LocateFixed,
  MapPin,
  Plus,
  Settings2,
} from "lucide-react";
import {
  prizeInventory,
  prizeLabel,
  type PrizeAmount,
} from "../../shared/prizes";
import { hasCoordinates } from "../../shared/exploration";
import { useWorkshop } from "../lib/store";
import { locate } from "../hooks/useExploration";
import { errorMessage } from "../lib/utils";
import {
  draftHasCoordinates,
  emptyWorkspace,
  newDraft,
  parseWorkspace,
  validateDraft,
  type TreasureDraft,
} from "../lib/treasure-drafts";
import TreasurePlacementMap from "./TreasurePlacementMap";
import type { Notify } from "./common";

interface Props {
  scope: string;
  busy: boolean;
  notify: Notify;
  onAdvanced: () => void;
}

export default function QuickTreasurePlacement({
  scope,
  busy,
  notify,
  onAdvanced,
}: Props) {
  const { state, act } = useWorkshop();
  const [initial] = useState(() => {
    try {
      return {
        draft: parseWorkspace(localStorage.getItem(scope)).drafts[0] ?? null,
        error: "",
      };
    } catch {
      return {
        draft: null,
        error:
          "작성 중인 보물을 불러오지 못했어요. 브라우저 저장 설정을 확인해주세요.",
      };
    }
  });
  const [draft, setDraft] = useState<TreasureDraft | null>(initial.draft);
  const draftRef = useRef(draft);
  const [step, setStep] = useState<"stock" | "choose" | "register">(
    draft ? "register" : "stock",
  );
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(initial.error);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const locationRequest = useRef(0);
  const mounted = useRef(true);
  const heading = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    key: number;
  } | null>(null);
  const disabled = busy || saving;
  const treasures = state!.treasures;
  const stock = prizeInventory(treasures);
  const remaining = stock.reduce((sum, p) => sum + p.remaining, 0);
  const remainingAmount = stock.reduce(
    (sum, p) => sum + p.remaining * p.amount,
    0,
  );
  const unassigned = treasures.filter(
    (t) => t.prizeAmount === undefined,
  ).length;
  const coordinates = draft && draftHasCoordinates(draft) ? draft : null;

  useEffect(() => {
    mounted.current = true;
    try {
      const prefix = scope.slice(0, scope.lastIndexOf(":") + 1);
      Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix) && key !== scope)
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      /* Save failures are shown when editing. */
    }
    return () => {
      mounted.current = false;
      locationRequest.current++;
    };
  }, [scope]);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "start" });
  }, [step]);

  function persist(next: TreasureDraft | null) {
    draftRef.current = next;
    setDraft(next);
    try {
      localStorage.setItem(
        scope,
        JSON.stringify({
          ...emptyWorkspace(),
          drafts: next ? [next] : [],
          selected: next?.id ?? null,
        }),
      );
      setStorageError("");
    } catch {
      setStorageError(
        "브라우저에 초안을 보관하지 못했어요. 등록하기 전에는 이 화면을 닫지 마세요.",
      );
    }
  }
  function update(patch: Partial<TreasureDraft>) {
    if (draftRef.current) persist({ ...draftRef.current, ...patch });
  }
  function cancelLocation() {
    locationRequest.current++;
    setLocating(false);
  }
  async function captureLocation() {
    if (disabled || !draftRef.current) return;
    const request = ++locationRequest.current;
    const id = draftRef.current.id;
    setLocating(true);
    setError("");
    try {
      const here = await locate();
      if (
        !mounted.current ||
        request !== locationRequest.current ||
        draftRef.current?.id !== id
      )
        return;
      if (
        !Number.isFinite(here.accuracy) ||
        here.accuracy <= 0 ||
        here.accuracy > 100
      )
        throw new Error(
          "위치 오차가 커요. 다시 확인하거나 지도에서 위치를 선택해주세요.",
        );
      update({
        lat: here.lat,
        lng: here.lng,
        gpsAccuracy: Math.round(here.accuracy),
      });
      setFocus({ lat: here.lat, lng: here.lng, key: Date.now() });
    } catch (e) {
      if (mounted.current && request === locationRequest.current)
        setError(errorMessage(e));
    } finally {
      if (mounted.current && request === locationRequest.current)
        setLocating(false);
    }
  }
  function choose(amount: PrizeAmount) {
    if (disabled) return;
    const existing = draftRef.current;
    if (!existing && treasures.length >= 100) return;
    const next = existing ?? {
      ...newDraft(treasures, emptyWorkspace().defaults, 0, 0),
      lat: null,
      lng: null,
    };
    persist({
      ...next,
      prizeAmount: amount,
      kind: amount === 0 ? "bomb" : "treasure",
    });
    setError("");
    setStep("register");
    if (!draftHasCoordinates(next)) void captureLocation();
  }
  async function register() {
    const current = draftRef.current;
    if (disabled || locating || savingRef.current || !current) return;
    const parsed = validateDraft(current);
    if (current.prizeAmount === undefined || parsed.error) {
      setError(parsed.error ?? "먼저 놓을 보물을 선택해주세요.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await act({
        action: "saveTreasures",
        treasures: [parsed.value!],
        resetGeneration: state!.resetGeneration ?? 0,
      });
      if (!mounted.current) return;
      persist(null);
      setStep("stock");
      notify(
        `${prizeLabel(current.prizeAmount)} 보물을 등록했어요. 다음 장소에서 보물 놓기를 눌러주세요.`,
      );
      heading.current?.scrollIntoView({ block: "start" });
    } catch (e) {
      if (mounted.current)
        setError(`${errorMessage(e)} 선택한 보물과 위치는 그대로 남아 있어요.`);
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section className="quick-placement">
      <div ref={heading} className="quick-heading">
        <div className="section-heading">
          <div>
            <h2>
              {step === "stock"
                ? "보물 놓기"
                : step === "choose"
                  ? "놓을 보물을 선택하세요"
                  : "이곳에 보물을 놓을까요?"}
            </h2>
            <p>
              {step === "stock"
                ? "숨길 장소에 도착하면 보물을 골라 등록하세요."
                : step === "choose"
                  ? "금액별 남은 수량을 확인하고 하나를 골라주세요."
                  : "지도에서 위치를 확인한 뒤 등록하면 끝이에요."}
            </p>
          </div>
          {step !== "stock" && (
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => {
                cancelLocation();
                setStep(step === "register" ? "choose" : "stock");
              }}
            >
              <ArrowLeft size={16} />
              뒤로
            </button>
          )}
        </div>
        <ol className="placement-steps" aria-label="보물 등록 순서">
          {(["stock", "choose", "register"] as const).map((value, index) => (
            <li key={value} aria-current={step === value ? "step" : undefined}>
              <span>{index + 1}</span>
              {["보물 놓기", "보물 선택", "등록"][index]}
            </li>
          ))}
        </ol>
      </div>
      {storageError && (
        <p className="registration-error" role="alert">
          {storageError}
        </p>
      )}
      {error && (
        <p className="registration-error" role="alert">
          {error}
        </p>
      )}
      {step !== "register" && (
        <>
          <div className="prize-stock-summary" aria-live="polite">
            <h3>
              남은 보물 <strong>{remaining}개</strong>
            </h3>
            <span>
              {remainingAmount.toLocaleString("ko-KR")}원 / 총 500,000원
            </span>
            <small>
              금액 지정 {100 - remaining}개 · 전체 등록 {treasures.length} /
              100개
            </small>
          </div>
          {unassigned > 0 && (
            <div className="prize-unassigned">
              <p>
                기존 보물 {unassigned}개는 금액 미지정으로 아래 수량에 포함되지
                않았어요.
              </p>
              <button
                className="text-button"
                disabled={disabled}
                onClick={onAdvanced}
              >
                기존 보물 금액 지정하기
              </button>
            </div>
          )}
          {step === "stock" && (
            <button
              className="button dark full place-treasure-start"
              disabled={disabled || treasures.length >= 100}
              onClick={() => {
                setError("");
                setStep(draft ? "register" : "choose");
              }}
            >
              <Plus size={19} />
              {draft ? "작성 중인 보물 이어서 등록" : "보물 놓기"}
            </button>
          )}
          <div className="prize-stock-grid" aria-label="금액별 남은 보물">
            {stock.map((p) => {
              const content = (
                <>
                  <strong>{prizeLabel(p.amount)}</strong>
                  <span>
                    <b>{p.remaining}개 남음</b> / {p.quantity}개
                  </span>
                  <small>
                    {p.placed}개 등록됨
                    {p.remaining === 0 ? " · 모두 놓았어요" : ""}
                  </small>
                </>
              );
              const existingSlot = treasures.some(
                (t) => t.id === draft?.id && t.prizeAmount === p.amount,
              );
              return step === "choose" ? (
                <button
                  key={p.amount}
                  className="prize-stock-item"
                  disabled={
                    disabled ||
                    (p.remaining === 0 && !existingSlot) ||
                    (!draft && treasures.length >= 100)
                  }
                  onClick={() => choose(p.amount)}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={p.amount}
                  className={`prize-stock-item ${p.remaining === 0 ? "is-empty" : ""}`}
                >
                  {content}
                </div>
              );
            })}
          </div>
          <p className="footnote">
            등록이 완료된 보물만 수량에서 차감해요. 발견된 보물도 등록 수량에
            포함돼요.
          </p>
        </>
      )}
      {step === "register" && draft && (
        <div className="quick-registration">
          <div className="quick-prize-selected">
            <div>
              <span>선택한 보물</span>
              <strong>
                {draft.prizeAmount === undefined
                  ? "금액을 선택해주세요"
                  : prizeLabel(draft.prizeAmount)}
              </strong>
              <small>
                {draft.name} · 발견 반경 {draft.radius}m
              </small>
            </div>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => {
                cancelLocation();
                setStep("choose");
              }}
            >
              보물 변경
            </button>
          </div>
          <div className="quick-location-status" role="status">
            <MapPin size={19} />
            <div>
              <strong>
                {locating
                  ? "현재 위치를 확인하고 있어요…"
                  : coordinates
                    ? "이 위치에 등록해요"
                    : "등록할 위치를 선택해주세요"}
              </strong>
              <small>
                {draft.gpsAccuracy !== undefined
                  ? `GPS 오차 ±${draft.gpsAccuracy}m · 핀을 확인해주세요`
                  : "지도를 눌러 위치를 지정하거나 조정할 수 있어요"}
              </small>
            </div>
          </div>
          <TreasurePlacementMap
            initialViewport={{
              lat: coordinates?.lat ?? state!.settings.center[0],
              lng: coordinates?.lng ?? state!.settings.center[1],
              level: 3,
            }}
            pins={
              coordinates
                ? [
                    {
                      id: draft.id,
                      lat: coordinates.lat,
                      lng: coordinates.lng,
                      number: 1,
                      draft: true,
                      found: false,
                      bomb: draft.kind === "bomb",
                    },
                  ]
                : []
            }
            selected={draft.id}
            radius={draft.radius}
            position={null}
            focus={focus}
            placing={!disabled}
            disabled={disabled}
            locating={locating}
            onPlace={(lat, lng) => {
              cancelLocation();
              update({ lat, lng, gpsAccuracy: undefined });
            }}
            onMove={(_id, lat, lng) => {
              cancelLocation();
              update({ lat, lng, gpsAccuracy: undefined });
            }}
            onSelect={() => {}}
            onLocate={() => void captureLocation()}
            onViewport={() => {}}
          />
          <button
            className="text-button quick-relocate"
            disabled={disabled || locating}
            onClick={() => void captureLocation()}
          >
            <LocateFixed size={17} />
            현재 위치 다시 확인
          </button>
          <button
            className="button dark full quick-register-button"
            disabled={
              disabled ||
              locating ||
              !coordinates ||
              draft.prizeAmount === undefined
            }
            onClick={() => void register()}
          >
            <Check size={19} />
            {saving ? "등록 중…" : "이 위치에 등록"}
          </button>
          <details className="quick-details">
            <summary>
              이름·힌트·위치 직접 입력 <span>선택 사항</span>
            </summary>
            <fieldset className="form-stack" disabled={disabled}>
              <label>
                보물 이름
                <input
                  value={draft.name}
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                작은 힌트 (선택)
                <textarea
                  value={draft.hint}
                  maxLength={300}
                  rows={2}
                  placeholder="비워둬도 나침반으로 찾을 수 있어요."
                  onChange={(e) => update({ hint: e.target.value })}
                />
              </label>
              <div className="form-pair">
                {(["lat", "lng"] as const).map((key) => (
                  <label key={key}>
                    {key === "lat" ? "위도" : "경도"}
                    <input
                      type="number"
                      step="any"
                      value={draft[key] ?? ""}
                      onChange={(e) => {
                        cancelLocation();
                        update({
                          [key]:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          gpsAccuracy: undefined,
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
          <p className="footnote">
            금액과 꽝 여부는 발견 전까지 참가자에게 보이지 않아요.
            {draft.kind === "bomb" ? " 꽝은 탐험 5분 휴식이 적용돼요." : ""}
          </p>
          <button
            className="text-button quick-cancel"
            disabled={disabled}
            onClick={() => {
              cancelLocation();
              persist(null);
              setError("");
              setStep("stock");
            }}
          >
            이번 보물 취소
          </button>
        </div>
      )}
      <div className="quick-advanced">
        <button
          className="text-button"
          disabled={disabled}
          onClick={onAdvanced}
        >
          <Settings2 size={17} />
          지도에서 배치 · 등록한 보물 관리
        </button>
      </div>
    </section>
  );
}
