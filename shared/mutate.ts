import { arGuidance, treasureGuidance } from "./exploration";
import { claimTreasure, GameError, isAdmin } from "./game";
import { makeSeed } from "./seed";
import type { ActionInput } from "./validation";
import type { ActionResponse, TreasureSecrets, WorkshopState } from "./types";
export function mutate(
  state: WorkshopState,
  secrets: TreasureSecrets,
  actorId: string,
  input: ActionInput,
  id: string,
  now = Date.now(),
): ActionResponse {
  const actor = state.members[actorId];
  if (!actor) throw new GameError("다시 입장해주세요.");
  if (input.action === "getArTarget")
    return arGuidance(state, actorId, input.treasureId, input.position, now);
  if (input.action === "getGuidance")
    return {
      guidance: treasureGuidance(
        state,
        actorId,
        input.treasureId,
        input.position,
        now,
      ),
    };
  if (input.action === "claimCamera")
    return {
      result: claimTreasure(
        state,
        secrets,
        actorId,
        input.treasureId,
        input.position,
        now,
      ),
    };
  if (input.action === "registerPush" || input.action === "unregisterPush")
    return {};
  if (!isAdmin(actor))
    throw new GameError("추진위원회만 사용할 수 있는 기능이에요.");
  switch (input.action) {
    case "createMember": {
      if (
        Object.values(state.members).some(
          (m) => m.handle === input.member.handle,
        )
      )
        throw new GameError("이미 등록된 아이디예요.");
      if (Object.keys(state.members).length >= 500)
        throw new GameError("참가자는 최대 500명까지 등록할 수 있어요.");
      state.members[id] = {
        id,
        ...input.member,
        role: "member",
        score: 0,
        found: 0,
        blockedUntil: 0,
        joined: false,
      };
      return { memberId: id };
    }
    case "deleteMember": {
      const target = Object.hasOwn(state.members, input.memberId)
        ? state.members[input.memberId]
        : null;
      if (!target) throw new GameError("참가자를 찾을 수 없어요.");
      if (target.role === "superadmin")
        throw new GameError("슈퍼 어드민 계정은 삭제할 수 없어요.");
      if (target.id === actorId)
        throw new GameError("현재 로그인한 내 계정은 삭제할 수 없어요.");
      if (target.role === "admin" && actor.role !== "superadmin")
        throw new GameError(
          "추진위원회 계정은 슈퍼 어드민만 삭제할 수 있어요.",
        );
      // Keep claimed treasures claimed so an already awarded prize cannot be won twice.
      delete state.members[input.memberId];
      break;
    }
    case "rotateInvite": {
      const target = state.members[input.memberId];
      if (input.memberId === actorId)
        throw new GameError(
          "현재 로그인한 계정의 링크는 운영자 복구 도구에서 재발급해주세요.",
        );
      if (!target) throw new GameError("참가자를 찾을 수 없어요.");
      if (target.role !== "member" && actor.role !== "superadmin")
        throw new GameError(
          "관리자 입장 링크는 슈퍼 어드민만 재발급할 수 있어요.",
        );
      return { memberId: target.id };
    }
    case "setRole": {
      if (actor.role !== "superadmin")
        throw new GameError("슈퍼 어드민만 권한을 변경할 수 있어요.");
      const target = state.members[input.memberId];
      if (!target || target.role === "superadmin")
        throw new GameError("슈퍼 어드민 권한은 변경할 수 없어요.");
      target.role = input.role;
      break;
    }
    case "updateTeam": {
      if (state.treasures.some((t) => t.foundBy))
        throw new GameError("보물 발견 후에는 팀을 변경할 수 없어요.");
      const target = state.members[input.memberId];
      if (!target) throw new GameError("참가자를 찾을 수 없어요.");
      target.team = input.team;
      break;
    }
    case "saveSchedule": {
      state.schedule = state.schedule
        .filter((s) => s.id !== input.schedule.id)
        .concat(input.schedule)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      if (state.schedule.length > 100)
        throw new GameError("일정은 최대 100개까지 등록할 수 있어요.");
      break;
    }
    case "deleteSchedule":
      state.schedule = state.schedule.filter((s) => s.id !== input.id);
      break;
    case "saveTreasure": {
      const current = state.treasures.find((t) => t.id === input.treasure.id);
      if (current?.foundBy)
        throw new GameError("이미 발견된 보물은 변경할 수 없어요.");
      const { kind, ...treasure } = input.treasure;
      secrets[treasure.id] = kind;
      state.treasures = state.treasures
        .filter((t) => t.id !== treasure.id)
        .concat({ ...treasure, foundBy: null, foundAt: null });
      if (state.treasures.length > 100)
        throw new GameError("보물은 최대 100개까지 등록할 수 있어요.");
      break;
    }
    case "deleteTreasure": {
      const treasure = state.treasures.find((t) => t.id === input.id);
      const finder = treasure?.foundBy && state.members[treasure.foundBy];
      if (treasure && finder) {
        if (treasure.outcome === "treasure") {
          finder.score = Math.max(0, finder.score - treasure.points);
          finder.found = Math.max(0, finder.found - 1);
        } else if (
          treasure.outcome === "bomb" &&
          treasure.foundAt !== null &&
          finder.blockedUntil === treasure.foundAt + 5 * 60 * 1000
        ) {
          finder.blockedUntil = 0;
        }
      }
      state.treasures = state.treasures.filter((t) => t.id !== input.id);
      delete secrets[input.id];
      break;
    }
    case "deleteNotice":
      state.notices = state.notices.filter((n) => n.id !== input.id);
      break;
    case "resetWorkshop": {
      if (actor.role !== "superadmin")
        throw new GameError("슈퍼 어드민만 전체 초기화할 수 있어요.");
      const members = Object.fromEntries(
        Object.entries(state.members)
          .filter(([, member]) => member.role === "superadmin")
          .map(([memberId, member]) => [
            memberId,
            { ...member, team: "미배정", score: 0, found: 0, blockedUntil: 0 },
          ]),
      );
      Object.assign(state, makeSeed(false), { members });
      for (const treasureId of Object.keys(secrets)) delete secrets[treasureId];
      break;
    }
    case "saveSettings":
      state.settings = input.settings;
      break;
    case "publishNotice": {
      if (
        input.audience !== "all" &&
        !Object.values(state.members).some((m) => m.team === input.audience)
      )
        throw new GameError("발송할 팀을 찾을 수 없어요.");
      state.notices.unshift({
        id,
        title: input.title,
        body: input.body,
        audience: input.audience,
        author: actor.handle,
        createdAt: now,
        pushStatus: input.push ? "pending" : "none",
      });
      state.notices = state.notices.slice(0, 100);
      return { noticeId: id };
    }
  }
  return {};
}
