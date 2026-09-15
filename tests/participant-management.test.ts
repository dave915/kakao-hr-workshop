import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSeed, demoSecrets } from "../shared/seed";
import { memberBatchInput } from "../shared/validation";
import { parseMemberImport } from "../shared/member-import";
import { mutate } from "../shared/mutate";
import { teamRanking } from "../shared/game";
import { updateDeviceStatus } from "../shared/device-status";
import { readNoticeIds, unreadNotices } from "../src/lib/notice-read";
import { detectDevice } from "../src/lib/device-status";
import type { DeviceReport } from "../shared/types";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("participant bulk import", () => {
  it("accepts 40 spreadsheet rows, headers and blank lines, normalizing English names", () => {
    const text =
      "이름\t영문명\t팀명\r\n" +
      Array.from(
        { length: 40 },
        (_, i) => `이름${i}\tPerson.${i}\t초록 탐험대`,
      ).join("\r\n") +
      "\n\n";
    const rows = parseMemberImport(text, {});
    expect(rows).toHaveLength(40);
    expect(rows.every((r) => !r.error)).toBe(true);
    expect(rows[0]).toMatchObject({
      line: 2,
      handle: "person.0",
      team: "초록 탐험대",
    });
  });
  it("supports comma quoting and simple space-separated lists", () => {
    expect(
      parseMemberImport('"홍, 길동",hong.gil,"노랑, 초록팀"', {})[0],
    ).toMatchObject({ name: "홍, 길동", team: "노랑, 초록팀", error: "" });
    expect(
      parseMemberImport("홍길동 Hong.gil 노랑 탐험대", {})[0],
    ).toMatchObject({ handle: "hong.gil", team: "노랑 탐험대", error: "" });
  });
  it("identifies missing columns, invalid handles, duplicates and existing accounts", () => {
    const rows = parseMemberImport(
      "홍길동\thong.gil\t노랑팀\n이하나\tHong.Gil\t초록팀\n누락\tmissing\t\n데이브\tdave.h\t워추위\n기타\thong@email\t팀",
      makeSeed(true).members,
    );
    expect(rows[0].error).toBe("");
    expect(rows.slice(1).every((r) => r.error)).toBe(true);
  });
  it("rejects duplicate batches before making any in-memory state changes", () => {
    const state = makeSeed(true),
      before = structuredClone(state);
    expect(() =>
      mutate(
        state,
        { ...demoSecrets },
        "dave.h",
        {
          action: "createMembers",
          requestId: crypto.randomUUID(),
          members: [
            {
              name: "새사람",
              handle: "new.name",
              team: "노랑팀",
              inviteCode: "a".repeat(32),
            },
            {
              name: "데이브",
              handle: "dave.h",
              team: "워추위",
              inviteCode: "b".repeat(32),
            },
          ],
        },
        "batch",
      ),
    ).toThrow("이미 등록");
    expect(state).toEqual(before);
  });
  it("creates only regular members and unique invitation results", () => {
    const input = memberBatchInput.parse({
      action: "createMembers",
      requestId: crypto.randomUUID(),
      members: Array.from({ length: 40 }, (_, i) => ({
        name: `참가자${i}`,
        handle: `person.${i}`,
        team: "노랑팀",
        role: "superadmin",
        inviteCode: String(i).padStart(32, "a"),
      })),
    });
    const state = makeSeed(true);
    const result = mutate(state, { ...demoSecrets }, "dave.h", input, "bulk");
    expect(result.invitations).toHaveLength(40);
    expect(
      result.invitations?.every(
        (i) => state.members[i.memberId].role === "member",
      ),
    ).toBe(true);
    expect(new Set(result.invitations?.map((i) => i.code)).size).toBe(40);
  });
  it("rejects 101 rows and more than 500 total members", () => {
    const rows = parseMemberImport(
      Array.from({ length: 101 }, (_, i) => `사람${i}\tp.${i}\t팀`).join("\n"),
      {},
    );
    expect(rows[100].error).toContain("100명");
  });
});
describe("team leaderboard", () => {
  it("excludes unassigned and committee teams without changing personal scores", () => {
    const state = makeSeed(true);
    const members = Object.values(state.members);
    members[0].team = " 미배정 ";
    members[0].score = 900;
    members[1].team = "워 추 위";
    members[1].score = 800;
    members[2].team = "팀 A";
    members[2].score = 100;
    const ranking = teamRanking(state);
    expect(ranking.map((r) => r.name)).not.toContain(" 미배정 ");
    expect(ranking.map((r) => r.name)).not.toContain("워 추 위");
    expect(members[0].score).toBe(900);
    expect(ranking.find((r) => r.name === "팀 A")?.score).toBe(100);
  });
});
describe("notice read state", () => {
  it("only counts new visible notices and tolerates removed notices", () => {
    const notices = makeSeed(true).notices;
    expect(
      unreadNotices(
        notices,
        notices.map((n) => n.id),
      ),
    ).toHaveLength(0);
    const next = { ...notices[0], id: "new-notice" };
    expect(
      unreadNotices(
        [next, ...notices],
        [...notices.map((n) => n.id), "deleted"],
      ),
    ).toEqual([next]);
  });
  it("keeps read lists scoped to each account and recovers corrupt storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "user-a" ? '["n1"]' : key === "broken" ? "{" : "[]",
    });
    expect(readNoticeIds("user-a")).toEqual(["n1"]);
    expect(readNoticeIds("user-b")).toEqual([]);
    expect(readNoticeIds("broken")).toEqual([]);
  });
});
describe("installation evidence", () => {
  const report: DeviceReport = {
    deviceId: crypto.randomUUID(),
    platform: "Android",
    installation: "installed",
    permission: "granted",
    push: "subscribed",
  };
  it("preserves installation history across removal, unknown checks and reinstall", () => {
    const first = updateDeviceStatus(undefined, report, 100);
    const removed = updateDeviceStatus(
      first,
      { ...report, installation: "not-installed" },
      200,
    );
    expect(removed).toMatchObject({
      installedAt: 100,
      removedAt: 200,
      installationCheckedAt: 200,
    });
    expect(
      updateDeviceStatus(removed, { ...report, installation: "unknown" }, 300),
    ).toMatchObject({
      installation: "not-installed",
      removedAt: 200,
      installationCheckedAt: 200,
      lastSeenAt: 300,
    });
    expect(updateDeviceStatus(removed, report, 400)).toMatchObject({
      installation: "installed",
      installedAt: 100,
      removedAt: 200,
    });
  });
  it("does not infer removal when an app has never been confirmed installed", () => {
    expect(
      updateDeviceStatus(
        undefined,
        { ...report, installation: "not-installed" },
        100,
      ),
    ).not.toHaveProperty("removedAt");
  });
  const browser = (
    standalone: boolean,
    version = 145,
    apps: unknown[] = [],
  ) => {
    vi.stubEnv("BASE_URL", "/workshop/");
    vi.stubGlobal("navigator", {
      userAgent: `Mozilla/5.0 Android Chrome/${version}.0`,
      maxTouchPoints: 1,
      getInstalledRelatedApps: vi.fn().mockResolvedValue(apps),
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    vi.stubGlobal("window", { Notification: {} });
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("matchMedia", () => ({ matches: standalone }));
    vi.stubGlobal("location", {
      origin: "https://example.com",
      href: "https://example.com/workshop/",
    });
    vi.stubGlobal("localStorage", { getItem: () => report.deviceId });
  };
  it("detects standalone installation and treats missing worker as unknown push state", async () => {
    browser(true);
    expect(await detectDevice()).toMatchObject({
      installation: "installed",
      push: "unknown",
      platform: "Android",
    });
  });
  it("matches only this app's manifest on supported Android browsers", async () => {
    browser(false, 145, [
      {
        platform: "webapp",
        url: "https://example.com/workshop/manifest.webmanifest",
      },
    ]);
    expect((await detectDevice()).installation).toBe("installed");
    browser(false, 145, [
      {
        platform: "webapp",
        url: "https://example.com/other/manifest.webmanifest",
      },
    ]);
    expect((await detectDevice()).installation).toBe("not-installed");
  });
  it("does not interpret an old desktop implementation as proof of removal", async () => {
    browser(false, 120);
    Object.assign(navigator, { userAgent: "Macintosh Chrome/120.0" });
    expect((await detectDevice()).installation).toBe("unknown");
  });
});
