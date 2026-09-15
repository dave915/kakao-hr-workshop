import type {
  Member,
  Position,
  Treasure,
  TreasureSecrets,
  WorkshopState,
  ClaimResult,
} from "./types";
export class GameError extends Error {}
export const isAdmin = (member?: Member | null) =>
  member?.role === "admin" || member?.role === "superadmin";
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dlat = rad(b.lat - a.lat),
    dlng = rad(b.lng - a.lng);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - Math.min(1, h)));
}
export function claimTreasure(
  state: WorkshopState,
  secrets: TreasureSecrets,
  memberId: string,
  treasureId: string,
  position: Position,
  now = Date.now(),
): ClaimResult {
  const member = state.members[memberId];
  const treasure = state.treasures.find((t) => t.id === treasureId);
  if (!member)
    throw new GameError("참가자 정보를 확인할 수 없어요. 다시 입장해주세요.");
  if (!state.settings.gameOpen)
    throw new GameError("지금은 탐험 준비 중이에요. 시작 공지를 기다려주세요.");
  if (member.blockedUntil > now)
    throw new GameError("휴식 시간이 끝나면 다시 탐험할 수 있어요.");
  if (!treasure)
    throw new GameError("이 보물은 더 이상 없어요. 지도를 새로 확인해주세요.");
  if (treasure.foundBy)
    throw new GameError(
      "다른 탐험대원이 먼저 발견했어요. 다음 보물을 찾아볼까요?",
    );
  if (
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lng) ||
    Math.abs(position.lat) > 90 ||
    Math.abs(position.lng) > 180 ||
    !Number.isFinite(position.timestamp) ||
    Math.abs(now - position.timestamp) > 60000
  )
    throw new GameError("현재 위치를 다시 확인해주세요.");
  if (
    !Number.isFinite(position.accuracy) ||
    position.accuracy <= 0 ||
    position.accuracy > 100
  )
    throw new GameError(
      "위치가 정확하지 않아요. 탁 트인 곳에서 다시 확인해주세요.",
    );
  if (distanceMeters(position, treasure) > treasure.radius)
    throw new GameError(
      `보물에서 ${treasure.radius}m 안으로 가까이 이동해주세요.`,
    );
  const outcome = secrets[treasureId];
  if (!outcome)
    throw new GameError(
      "보물 정보를 확인하는 중이에요. 추진위원회에 문의해주세요.",
    );
  treasure.foundBy = memberId;
  treasure.foundAt = now;
  treasure.outcome = outcome;
  if (outcome === "bomb") member.blockedUntil = now + 5 * 60 * 1000;
  else {
    member.score += treasure.points;
    member.found += 1;
  }
  return {
    outcome,
    points: outcome === "bomb" ? 0 : treasure.points,
    blockedUntil: member.blockedUntil,
  };
}
export const memberRanking = (state: Pick<WorkshopState, "members">) =>
  Object.values(state.members).sort(
    (a, b) =>
      b.score - a.score ||
      b.found - a.found ||
      a.handle.localeCompare(b.handle),
  );
export function teamRanking(state: Pick<WorkshopState, "members">) {
  const result = new Map<
    string,
    { name: string; score: number; found: number; members: number }
  >();
  Object.values(state.members).forEach((p) => {
    if (["", "미배정", "워추위"].includes(p.team.replace(/\s/g, ""))) return;
    const t = result.get(p.team) ?? {
      name: p.team,
      score: 0,
      found: 0,
      members: 0,
    };
    t.score += p.score;
    t.found += p.found;
    t.members++;
    result.set(p.team, t);
  });
  return [...result.values()].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}
export function scheduleStatus(
  item: { startsAt: string; endsAt: string },
  now: number,
) {
  return now < Date.parse(item.startsAt)
    ? "upcoming"
    : now < Date.parse(item.endsAt)
      ? "current"
      : "past";
}
export const remainingTreasures = (
  treasures: Array<Pick<Treasure, "foundBy">>,
) => treasures.filter((t) => !t.foundBy).length;
