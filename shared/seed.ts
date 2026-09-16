import type { Member, TreasureSecrets, WorkshopState } from "./types";
import { DEFAULT_TREASURE_RADIUS } from "./game";
export const demoSecrets: TreasureSecrets = {
  t1: "treasure",
  t2: "treasure",
  t3: "bomb",
  t4: "treasure",
  t5: "treasure",
  t6: "treasure",
};
const people = [
  ["dave.h", "데이브", "옐로우 탐험대", "superadmin"],
  ["alex.k", "알렉스", "옐로우 탐험대", "member"],
  ["june.p", "준", "그린 탐험대", "member"],
  ["sophia.l", "소피아", "오렌지 탐험대", "member"],
  ["ryan.j", "라이언", "그린 탐험대", "member"],
  ["ella.s", "엘라", "옐로우 탐험대", "member"],
] as const;
export function makeSeed(demo = false): WorkshopState {
  const members: Record<string, Member> = {};
  if (demo)
    people.forEach(([id, name, team, role]) => {
      members[id] = {
        id,
        name,
        handle: id,
        team,
        role,
        score: 0,
        found: 0,
        blockedUntil: 0,
        joined: true,
      };
    });
  return {
    version: 1,
    settings: {
      title: "일상 밖으로",
      subtitle: "함께라서 더 즐거운, 우리의 작은 모험",
      location: demo ? "서울숲 · 예시 장소" : "장소를 설정해주세요",
      startsAt: "2026-10-16T10:00:00+09:00",
      endsAt: "2026-10-16T18:00:00+09:00",
      center: [37.5445, 127.0374],
      gameOpen: demo,
    },
    members,
    schedule: demo
      ? [
          {
            id: "s1",
            title: "우리의 모험, 시작!",
            startsAt: "2026-10-16T10:00:00+09:00",
            endsAt: "2026-10-16T10:30:00+09:00",
            location: "서울숲 입구",
            description: "서로 반갑게 인사하고 탐험 여권을 받아요.",
            category: "gather",
          },
          {
            id: "s2",
            title: "마음의 거리, 한 걸음 더",
            startsAt: "2026-10-16T10:30:00+09:00",
            endsAt: "2026-10-16T12:00:00+09:00",
            location: "커뮤니티 라운지",
            description: "팀원들과 서로를 알아가는 아이스브레이킹.",
            category: "activity",
          },
          {
            id: "s3",
            title: "맛있는 쉼표",
            startsAt: "2026-10-16T12:00:00+09:00",
            endsAt: "2026-10-16T13:00:00+09:00",
            location: "피크닉 가든",
            description: "함께 먹으면 더 맛있으니까. 맛있는 점심 시간!",
            category: "meal",
          },
          {
            id: "s4",
            title: "숲속에 숨겨진 보물을 찾아라",
            startsAt: "2026-10-16T13:00:00+09:00",
            endsAt: "2026-10-16T15:00:00+09:00",
            location: "서울숲 탐험 구역",
            description:
              "지도를 따라 숨겨진 보물을 찾고 우리 팀의 점수를 모아요.",
            category: "activity",
          },
          {
            id: "s5",
            title: "잠깐 쉬어가도 괜찮아",
            startsAt: "2026-10-16T15:00:00+09:00",
            endsAt: "2026-10-16T16:00:00+09:00",
            location: "피크닉 가든",
            description: "커피 한 잔과 함께 오늘의 발견을 나눠요.",
            category: "rest",
          },
          {
            id: "s6",
            title: "오늘의 발견, 함께 나눠요",
            startsAt: "2026-10-16T16:00:00+09:00",
            endsAt: "2026-10-16T18:00:00+09:00",
            location: "커뮤니티 라운지",
            description: "탐험 시상식과 단체 사진으로 마무리해요.",
            category: "gather",
          },
        ]
      : [],
    treasures: demo
      ? [
          {
            id: "t1",
            name: "첫 번째 작은 발견",
            hint: "커다란 나무 아래, 잠시 쉬어가는 곳을 살펴보세요.",
            lat: 37.5445,
            lng: 127.0374,
            points: 100,
            radius: DEFAULT_TREASURE_RADIUS,
            foundBy: null,
            foundAt: null,
          },
          {
            id: "t2",
            name: "초록빛 행운",
            hint: "물이 반짝이는 길을 따라가 보세요.",
            lat: 37.5453,
            lng: 127.0386,
            points: 150,
            radius: DEFAULT_TREASURE_RADIUS,
            foundBy: null,
            foundAt: null,
          },
          {
            id: "t3",
            name: "수상한 선물",
            hint: "갈림길 끝에 누군가 놓고 간 선물이 있어요.",
            lat: 37.5439,
            lng: 127.0367,
            points: 100,
            radius: DEFAULT_TREASURE_RADIUS,
            foundBy: null,
            foundAt: null,
          },
          {
            id: "t4",
            name: "햇살 한 조각",
            hint: "노란 꽃이 반겨주는 산책길을 찾아보세요.",
            lat: 37.5459,
            lng: 127.0363,
            points: 200,
            radius: DEFAULT_TREASURE_RADIUS,
            foundBy: null,
            foundAt: null,
          },
          {
            id: "t5",
            name: "함께 걷는 길",
            hint: "친구와 나란히 앉을 수 있는 곳이에요.",
            lat: 37.544,
            lng: 127.0393,
            points: 100,
            radius: DEFAULT_TREASURE_RADIUS,
            foundBy: null,
            foundAt: null,
          },
          {
            id: "t6",
            name: "모험의 마지막 장",
            hint: "숲 가장자리, 작은 표지판을 찾아보세요.",
            lat: 37.5461,
            lng: 127.0396,
            points: 250,
            radius: DEFAULT_TREASURE_RADIUS,
            foundBy: null,
            foundAt: null,
          },
        ]
      : [],
    notices: demo
      ? [
          {
            id: "n1",
            title: "탐험대 여러분, 반가워요!",
            body: "편한 신발과 가벼운 마음만 챙겨오세요. 함께 웃고, 걷고, 발견할 하루를 준비했어요. 워크샵 일정과 장소는 예시이며 추진위원회가 변경할 수 있어요.",
            audience: "all",
            author: "워크샵 추진위원회",
            createdAt: Date.parse("2026-10-15T09:00:00+09:00"),
            pushStatus: "none",
          },
        ]
      : [],
  };
}
