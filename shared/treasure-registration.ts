import { GameError } from "./game";
import { prizeInventory, prizeLabel } from "./prizes";
import type { Treasure, TreasureSecrets, WorkshopState } from "./types";
import type { ActionInput, TreasureInput } from "./validation";

export function registrationValues(
  t: Treasure,
  kind: TreasureInput["kind"],
): TreasureInput {
  return {
    id: t.id,
    name: t.name,
    hint: t.hint,
    lat: t.lat,
    lng: t.lng,
    points: t.points,
    ...(t.prizeAmount !== undefined ? { prizeAmount: t.prizeAmount } : {}),
    radius: t.radius,
    kind,
  };
}
export function sameRegistration(a: TreasureInput, b: TreasureInput): boolean {
  return (
    [
      ...new Set([...Object.keys(a), ...Object.keys(b)]),
    ] as (keyof TreasureInput)[]
  ).every((key) => a[key] === b[key]);
}

/** Validate the complete batch before changing either state or private kinds. */
export function saveTreasures(
  state: WorkshopState,
  secrets: TreasureSecrets,
  input: Extract<ActionInput, { action: "saveTreasures" }>,
) {
  if (input.resetGeneration !== (state.resetGeneration ?? 0))
    throw new GameError("워크샵이 초기화되었어요. 화면을 새로고침해주세요.");
  const additions = input.treasures.filter(
    (t) => !state.treasures.some((saved) => saved.id === t.id),
  );
  if (state.treasures.length + additions.length > 100)
    throw new GameError("보물은 최대 100개까지 등록할 수 있어요.");
  const changes = input.treasures.filter(({ original, ...next }) => {
    const current = state.treasures.find((t) => t.id === next.id);
    const values =
      current &&
      registrationValues(
        current,
        secrets[current.id] ?? current.outcome ?? "treasure",
      );
    // A lost response can be retried without erasing a subsequent discovery.
    if (values && sameRegistration(values, next)) return false;
    if (current?.foundBy)
      throw new GameError(`‘${next.name}’은 이미 발견되어 수정할 수 없어요.`);
    if (original && (!values || !sameRegistration(values, original)))
      throw new GameError(
        `‘${next.name}’의 원본이 변경되거나 삭제되었어요. 초안을 버리고 다시 선택해주세요.`,
      );
    if (!original && current)
      throw new GameError(
        `‘${next.name}’은 이미 등록되어 있어요. 목록에서 다시 선택해주세요.`,
      );
    if (current?.prizeAmount !== undefined && next.prizeAmount === undefined)
      throw new GameError(
        "등록된 보물의 금액을 유지해주세요. 앱을 새로고침한 뒤 다시 시도해주세요.",
      );
    return true;
  });
  // Check the final batch, including swaps, before mutating either collection.
  for (const treasure of changes) {
    if (
      treasure.prizeAmount !== undefined &&
      (treasure.prizeAmount === 0) !== (treasure.kind === "bomb")
    )
      throw new GameError(
        "선택한 보물 금액과 종류가 맞지 않아요. 다시 선택해주세요.",
      );
  }
  const changedIds = new Set(changes.map((t) => t.id));
  const inventory = prizeInventory([
    ...state.treasures.filter((t) => !changedIds.has(t.id)),
    ...changes,
  ]);
  const exhausted = inventory.find((p) => p.placed > p.quantity);
  if (exhausted)
    throw new GameError(
      `${prizeLabel(exhausted.amount)} 보물은 총 ${exhausted.quantity}개예요. 남은 수량을 확인하고 다른 보물을 선택해주세요.`,
    );
  for (const { original: _original, kind, ...treasure } of changes) {
    const index = state.treasures.findIndex((t) => t.id === treasure.id);
    const next = { ...treasure, foundBy: null, foundAt: null };
    if (index < 0) state.treasures.push(next);
    else state.treasures[index] = next;
    secrets[treasure.id] = kind;
  }
}
