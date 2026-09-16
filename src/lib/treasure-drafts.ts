import { z } from "zod";
import { treasureInput, type TreasureInput } from "../../shared/validation";
import { DEFAULT_TREASURE_RADIUS } from "../../shared/game";

const draftInput = treasureInput.extend({
  name: z.string().max(80),
  hint: z.string().max(300),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  radius: z.number().nullable(),
  points: z.number().nullable(),
  original: treasureInput.optional(),
  gpsAccuracy: z.number().optional(),
});
export type TreasureDraft = z.infer<typeof draftInput>;
export type MapViewport = { lat: number; lng: number; level: number };
const workspaceInput = z.object({
  version: z.literal(2),
  mode: z.enum(["onsite", "map"]),
  drafts: z
    .array(draftInput)
    .max(100)
    .refine((items) => new Set(items.map((t) => t.id)).size === items.length),
  selected: z.string().nullable(),
  defaults: treasureInput.pick({ kind: true, radius: true, points: true }),
  viewport: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      level: z.number().int().min(1).max(14),
    })
    .nullable(),
});
export type DraftWorkspace = z.infer<typeof workspaceInput>;
export function emptyWorkspace(): DraftWorkspace {
  return {
    version: 2,
    mode: "onsite",
    drafts: [],
    selected: null,
    defaults: {
      kind: "treasure",
      radius: DEFAULT_TREASURE_RADIUS,
      points: 100,
    },
    viewport: null,
  };
}
export function draftStorageKey(
  project: string,
  uid: string,
  generation: number,
): string {
  return `hr-treasure-drafts-v1:${encodeURIComponent(project)}:${encodeURIComponent(uid)}:${generation}`;
}
export function parseWorkspace(raw: string | null): DraftWorkspace {
  if (!raw) return emptyWorkspace();
  const saved = JSON.parse(raw);
  if (saved?.version === 1) {
    saved.version = 2;
    // Keep saved treasures and unfinished drafts; migrate the old creation default.
    if (saved.defaults?.radius === 50)
      saved.defaults.radius = DEFAULT_TREASURE_RADIUS;
  }
  return workspaceInput.parse(saved);
}
export function nextTreasureName(items: { name: string }[]): string {
  const highest = items.reduce(
    (max, t) => Math.max(max, Number(/^보물\s*(\d+)$/.exec(t.name)?.[1] ?? 0)),
    0,
  );
  return `보물 ${String(highest + 1).padStart(2, "0")}`;
}
export function newDraft(
  items: { name: string }[],
  defaults: DraftWorkspace["defaults"],
  lat: number,
  lng: number,
): TreasureDraft {
  return {
    id: crypto.randomUUID(),
    name: nextTreasureName(items),
    hint: "",
    ...defaults,
    lat,
    lng,
  };
}
export function validateDraft(
  draft: TreasureDraft,
):
  | { value: TreasureInput & { original?: TreasureInput }; error?: never }
  | { error: string; value?: never } {
  const parsed = treasureInput.safeParse(draft);
  if (!parsed.success) {
    const field = parsed.error.issues[0].path[0];
    const messages: Record<string, string> = {
      name: "보물 이름을 입력해주세요.",
      hint: "보물을 찾을 힌트를 입력해주세요.",
      lat: "위도를 −90~90 사이로 입력해주세요.",
      lng: "경도를 −180~180 사이로 입력해주세요.",
      points: "포인트를 10~1,000 사이의 정수로 입력해주세요.",
      radius: "발견 반경을 10~200m 사이의 정수로 입력해주세요.",
    };
    return { error: messages[String(field)] ?? "입력 내용을 확인해주세요." };
  }
  return {
    value: {
      ...parsed.data,
      ...(draft.original ? { original: draft.original } : {}),
    },
  };
}
export function draftHasCoordinates(
  t: TreasureDraft,
): t is TreasureDraft & { lat: number; lng: number } {
  return (
    t.lat !== null &&
    t.lng !== null &&
    Math.abs(t.lat) <= 90 &&
    Math.abs(t.lng) <= 180
  );
}
