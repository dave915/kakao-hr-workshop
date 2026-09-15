import { distanceMeters, GameError } from "./game";
import type {
  Position,
  Treasure,
  TreasureGuidance,
  VisibleTreasure,
  WorkshopState,
  WorkshopView,
  ActionResponse,
} from "./types";
export const AR_MAX_ACCURACY = 40;
export const AR_POSITION_MAX_AGE = 20000;
export const AR_TARGET_MAX_AGE = 30000;
export function hasCoordinates(t: VisibleTreasure): t is Treasure {
  return Number.isFinite(t.lat) && Number.isFinite(t.lng);
}
/** Only found treasures carry coordinates into the participant-readable document. */
export function participantView(state: WorkshopState): WorkshopView {
  return {
    ...state,
    treasures: state.treasures.map((t) => {
      if (t.foundBy) return { ...t };
      return {
        id: t.id,
        name: t.name,
        hint: t.hint,
        points: t.points,
        radius: t.radius,
        foundBy: null,
        foundAt: null,
      };
    }),
  };
}
export function bearingDegrees(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const a = rad(from.lat),
    b = rad(to.lat),
    delta = rad(to.lng - from.lng);
  return (
    ((Math.atan2(
      Math.sin(delta) * Math.cos(b),
      Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta),
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
}
export function treasureGuidance(
  state: WorkshopState,
  uid: string,
  id: string,
  position: Position,
  now = Date.now(),
): TreasureGuidance {
  const member = state.members[uid];
  if (!member) throw new GameError("개인 입장 링크로 다시 입장해주세요.");
  if (!state.settings.gameOpen)
    throw new GameError("지금은 탐험 준비 중이에요.");
  if (member.blockedUntil > now)
    throw new GameError("휴식 시간이 끝나면 다시 탐험할 수 있어요.");
  const target = state.treasures.find((t) => t.id === id);
  if (!target)
    throw new GameError("이 보물은 더 이상 없어요. 다른 힌트를 골라주세요.");
  if (target.foundBy)
    throw new GameError("누군가 먼저 발견했어요! 다른 힌트를 골라주세요.");
  if (
    !Number.isFinite(position.timestamp) ||
    Math.abs(now - position.timestamp) > 60000 ||
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lng) ||
    Math.abs(position.lat) > 90 ||
    Math.abs(position.lng) > 180
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
  const distance = distanceMeters(position, target);
  const withinRange = distance <= target.radius;
  const proximity = withinRange
    ? "within"
    : distance <= target.radius + 30
      ? "hot"
      : distance <= target.radius + 100
        ? "close"
        : distance <= target.radius + 250
          ? "warm"
          : "far";
  const bearing = withinRange
    ? null
    : (Math.round(bearingDegrees(position, target) / 45) * 45) % 360;
  const direction =
    bearing === null
      ? "주변"
      : [
          "북쪽",
          "북동쪽",
          "동쪽",
          "남동쪽",
          "남쪽",
          "남서쪽",
          "서쪽",
          "북서쪽",
        ][bearing / 45];
  return {
    treasureId: id,
    bearing,
    direction,
    distance: Math.round(distance / 10) * 10,
    proximity,
    heat: { far: 15, warm: 35, close: 60, hot: 85, within: 100 }[proximity],
    withinRange,
    updatedAt: now,
  };
}
export function approachTrend(
  previous: TreasureGuidance | null,
  next: TreasureGuidance,
  accuracy: number,
): "closer" | "farther" | "steady" {
  if (!previous || previous.treasureId !== next.treasureId) return "steady";
  const difference = previous.distance - next.distance;
  const threshold = Math.max(15, accuracy);
  return difference > threshold
    ? "closer"
    : difference < -threshold
      ? "farther"
      : "steady";
}

/** Reveal only the selected nearby target for location AR, never its outcome. */
export function arGuidance(
  state: WorkshopState,
  uid: string,
  id: string,
  position: Position,
  now = Date.now(),
): ActionResponse {
  const guidance = treasureGuidance(state, uid, id, position, now);
  if (Math.abs(now - position.timestamp) > AR_POSITION_MAX_AGE)
    throw new GameError("AR에 사용할 위치를 다시 확인해주세요.");
  if (position.accuracy > AR_MAX_ACCURACY)
    throw new GameError(
      "GPS 오차가 커요. 탁 트인 곳에서 위치를 다시 확인해주세요.",
    );
  const target = state.treasures.find((t) => t.id === id)!;
  const visibilityRange = Math.max(100, target.radius + 40);
  return {
    guidance,
    arTarget:
      distanceMeters(position, target) <= visibilityRange
        ? {
            treasureId: id,
            lat: target.lat,
            lng: target.lng,
            visibilityRange,
            updatedAt: now,
          }
        : null,
  };
}
