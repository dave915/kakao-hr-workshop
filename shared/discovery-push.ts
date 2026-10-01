import { englishName } from "./names";
import { prizeLabel } from "./prizes";
import type { Member, Treasure, WorkshopState } from "./types";

export interface DiscoveryPush {
  treasureId: string;
  finderId: string;
  foundAt: number;
  resetGeneration: number;
  title: string;
  body: string;
  createdAt: number;
  status: "pending" | "sending" | "sent" | "partial" | "failed" | "cancelled";
  attempts: number;
  deliveredTokenIds: string[];
  rejectedTokenIds: string[];
  leaseId?: string;
  leaseUntil?: number;
  delivered?: number;
  failed?: number;
  reason?: string;
  finishedAt?: number;
}

export function discoveryPush(
  state: WorkshopState,
  treasure: Treasure,
): DiscoveryPush {
  const finder = treasure.foundBy && state.members[treasure.foundBy];
  if (!finder || treasure.foundAt === null || !treasure.outcome)
    throw new Error("A push requires a committed discovery result.");
  const name = englishName(finder.handle);
  const reward =
    treasure.prizeAmount !== undefined
      ? `${prizeLabel(treasure.prizeAmount)} 보물`
      : `${treasure.points.toLocaleString("ko-KR")}포인트 보물`;
  return {
    treasureId: treasure.id,
    finderId: finder.id,
    foundAt: treasure.foundAt,
    resetGeneration: state.resetGeneration ?? 0,
    title: treasure.outcome === "bomb" ? "앗, 꽝 발견!" : "보물 발견!",
    body:
      treasure.outcome === "bomb"
        ? `${name}가 꽝을 발견했어요. 잠깐 쉬고 다시 도전해요!`
        : `${name}가 ${reward}을 발견했어요!`,
    createdAt: treasure.foundAt,
    status: "pending",
    attempts: 0,
    deliveredTokenIds: [],
    rejectedTokenIds: [],
  };
}

export interface PushRegistration {
  id: string;
  uid: string;
  token: string;
  deviceId?: string;
  updatedAt?: number;
}
/** Include every current member, including the finder and all committee members. */
export function discoveryRecipients(
  records: PushRegistration[],
  members: Record<string, Member>,
) {
  const devices = new Map<string, PushRegistration>();
  for (const record of records) {
    if (
      !Object.hasOwn(members, record.uid) ||
      typeof record.token !== "string" ||
      !record.token
    )
      continue;
    const key = record.deviceId
      ? `${record.uid}:${record.deviceId}`
      : record.token;
    const previous = devices.get(key);
    if (!previous || (record.updatedAt ?? 0) > (previous.updatedAt ?? 0))
      devices.set(key, record);
  }
  return [
    ...new Map(
      [...devices.values()].map((record) => [record.token, record]),
    ).values(),
  ];
}
