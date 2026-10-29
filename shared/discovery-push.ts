import { englishName } from "./names";
import { prizeLabel } from "./prizes";
import type { Member, Treasure, WorkshopState } from "./types";

const CHEER_MESSAGES = [
  "{name}가 응원 보물을 발견했습니다! 마주치면 엄지 척을 날려주세요!",
  "{name}가 응원을 획득했습니다! 만나면 하이파이브를 요청하세요!",
  "응원 보물 발견자 {name}! 마주치면 경례로 예우해주세요!",
  "{name}가 희귀 보물을 찾았습니다! 만나면 축하의 한마디를 건네주세요!",
  "{name}의 응원 게이지가 충전되었습니다! 마주치면 축하 댄스를 선물해주세요!",
  "{name}가 행운의 응원을 발견했습니다! 만나면 행운을 나눠달라고 해보세요!",
  "응원 보물을 획득한 {name}! 만나면 응원 한 스푼을 보태주세요!",
  "{name}가 응원을 발견했습니다! 마주치면 ‘당신이 보물입니다!’라고 외쳐주세요!",
  "전설의 응원 보물 발견자 {name}! 마주치면 과장되게 존경을 표해주세요!",
] as const;

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
  random: () => number = Math.random,
): DiscoveryPush {
  const finder = treasure.foundBy && state.members[treasure.foundBy];
  if (!finder || treasure.foundAt === null || !treasure.outcome)
    throw new Error("A push requires a committed discovery result.");
  const name = englishName(finder.handle);
  const reward =
    treasure.prizeAmount !== undefined
      ? `${prizeLabel(treasure.prizeAmount, treasure.outcome)} 보물`
      : `${treasure.points.toLocaleString("ko-KR")}포인트 보물`;
  return {
    treasureId: treasure.id,
    finderId: finder.id,
    foundAt: treasure.foundAt,
    resetGeneration: state.resetGeneration ?? 0,
    title:
      treasure.outcome === "bomb"
        ? "앗, 꽝 발견!"
        : treasure.outcome === "cheer"
          ? "응원을 발견했어요!"
          : "보물 발견!",
    body:
      treasure.outcome === "bomb"
        ? `${name}가 꽝을 발견했어요. 잠깐 쉬고 다시 도전해요!`
        : treasure.outcome === "cheer"
          ? CHEER_MESSAGES[
              Math.floor(random() * CHEER_MESSAGES.length)
            ].replaceAll("{name}", name)
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
