import { GameError } from "./game";
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
    radius: t.radius,
    kind,
  };
}
export function sameRegistration(a: TreasureInput, b: TreasureInput): boolean {
  return (Object.keys(a) as (keyof TreasureInput)[]).every(
    (key) => a[key] === b[key],
  );
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
    return true;
  });
  for (const { original: _original, kind, ...treasure } of changes) {
    const index = state.treasures.findIndex((t) => t.id === treasure.id);
    const next = { ...treasure, foundBy: null, foundAt: null };
    if (index < 0) state.treasures.push(next);
    else state.treasures[index] = next;
    secrets[treasure.id] = kind;
  }
}
