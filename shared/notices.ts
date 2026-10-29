import { isAdmin } from "./game";
import type { Member } from "./types";

export const COMMITTEE_AUDIENCE = "__committee__";

export function isNoticeRecipient(audience: string, member?: Member | null) {
  if (!member) return false;
  if (audience === COMMITTEE_AUDIENCE) return isAdmin(member);
  return audience === "all" || audience === member.team;
}

export function noticeAudienceLabel(audience: string) {
  if (audience === "all") return "전체";
  if (audience === COMMITTEE_AUDIENCE) return "워추위 전용";
  return audience;
}
