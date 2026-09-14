import { z } from "zod";
const text = (max: number) =>
  z.string().trim().min(1, "내용을 입력해주세요.").max(max);
const iso = z
  .string()
  .refine((v) => Number.isFinite(Date.parse(v)), "올바른 일시를 입력해주세요.");
export const memberInput = z.object({
  name: text(40),
  handle: text(40).regex(
    /^[a-z0-9._-]+$/,
    "영문 소문자, 숫자, ., _, -만 사용할 수 있어요.",
  ),
  team: text(40),
});
export const scheduleInput = z
  .object({
    id: text(100),
    title: text(100),
    startsAt: iso,
    endsAt: iso,
    location: text(100),
    description: z.string().max(1000),
    category: z.enum(["gather", "activity", "meal", "rest"]),
  })
  .refine(
    (s) => Date.parse(s.endsAt) > Date.parse(s.startsAt),
    "종료 시각은 시작 시각보다 늦어야 해요.",
  );
export const treasureInput = z.object({
  id: text(100),
  name: text(80),
  hint: text(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().int().min(10).max(200),
  points: z.number().int().min(10).max(1000),
  kind: z.enum(["treasure", "bomb"]),
});
export const settingsInput = z
  .object({
    title: text(60),
    subtitle: text(120),
    location: text(100),
    startsAt: iso,
    endsAt: iso,
    center: z.tuple([
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
    ]),
    gameOpen: z.boolean(),
  })
  .refine(
    (s) => Date.parse(s.endsAt) > Date.parse(s.startsAt),
    "종료 일시는 시작 일시보다 늦어야 해요.",
  );
export const actionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("claim"),
    treasureId: text(100),
    position: z.object({
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number(),
      timestamp: z.number(),
    }),
  }),
  z.object({ action: z.literal("createMember"), member: memberInput }),
  z.object({ action: z.literal("rotateInvite"), memberId: text(100) }),
  z.object({
    action: z.literal("setRole"),
    memberId: text(100),
    role: z.enum(["member", "admin"]),
  }),
  z.object({
    action: z.literal("updateTeam"),
    memberId: text(100),
    team: text(40),
  }),
  z.object({ action: z.literal("saveSchedule"), schedule: scheduleInput }),
  z.object({ action: z.literal("deleteSchedule"), id: text(100) }),
  z.object({ action: z.literal("saveTreasure"), treasure: treasureInput }),
  z.object({ action: z.literal("deleteTreasure"), id: text(100) }),
  z.object({ action: z.literal("saveSettings"), settings: settingsInput }),
  z.object({
    action: z.literal("publishNotice"),
    title: text(100),
    body: text(2000),
    audience: text(40),
    push: z.boolean(),
  }),
  z.object({
    action: z.literal("registerPush"),
    token: z.string().min(20).max(4096),
  }),
  z.object({
    action: z.literal("unregisterPush"),
    token: z.string().min(20).max(4096),
  }),
]);
export type ActionInput = z.infer<typeof actionInput>;
