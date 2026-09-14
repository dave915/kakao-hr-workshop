import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { makeSeed, demoSecrets } from "../shared/seed";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const root = "http://127.0.0.1:5387/demo-workshop/asia-northeast3";
async function call(name: string, data: unknown, token?: string) {
  const r = await fetch(`${root}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return { status: r.status, ...(await r.json()) };
}
async function redeem(code: string) {
  const r = await call("redeemInvite", { code });
  if (!r.result?.token) throw new Error(JSON.stringify(r));
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: r.result.token, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(JSON.stringify(body));
  return body.idToken as string;
}
describe.skipIf(!enabled)("callable backend integration", () => {
  let db: ReturnType<typeof getFirestore>,
    adminToken: string,
    memberToken: string,
    memberCode: string;
  beforeAll(async () => {
    initializeApp({ projectId: "demo-workshop" });
    db = getFirestore();
    const state = makeSeed(true);
    const batch = db.batch();
    batch.set(db.doc("workshops/main"), state);
    batch.set(db.doc("private/treasures"), { kinds: demoSecrets });
    let adminCode = "";
    for (const m of Object.values(state.members)) {
      batch.set(db.doc(`members/${m.id}`), { role: m.role, sessionVersion: 1 });
      const code = randomBytes(24).toString("base64url");
      batch.set(db.doc(`invites/${hash(code)}`), {
        uid: m.id,
        sessionVersion: 1,
        expiresAt: Date.now() + 86400000,
      });
      if (m.id === "dave.h") adminCode = code;
      if (m.id === "alex.k") memberCode = code;
    }
    await batch.commit();
    adminToken = await redeem(adminCode);
    memberToken = await redeem(memberCode);
  }, 30000);
  it("allows more than 30 valid arrivals on shared Wi-Fi", async () => {
    for (let i = 0; i < 32; i++)
      expect((await call("redeemInvite", { code: memberCode })).status).toBe(
        200,
      );
  }, 30000);
  it("rejects unsigned calls and participant admin mutations", async () => {
    expect(
      (
        await call("workshopAction", {
          action: "setRole",
          memberId: "alex.k",
          role: "admin",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          "workshopAction",
          { action: "setRole", memberId: "alex.k", role: "admin" },
          memberToken,
        )
      ).status,
    ).not.toBe(200);
  });
  it("issues an unguessable personal link and redeems it as the exact member", async () => {
    const created = await call(
      "workshopAction",
      {
        action: "createMember",
        member: {
          name: "테스트",
          handle: "integration.member",
          team: "테스트팀",
        },
      },
      adminToken,
    );
    expect(created.status).toBe(200);
    expect(created.result.code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const token = await redeem(created.result.code);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    expect(payload.user_id).toBe(created.result.memberId);
  });
  it("serializes simultaneous discoveries so exactly one person wins", async () => {
    const treasure = makeSeed(true).treasures[0];
    const data = {
      action: "claim",
      treasureId: treasure.id,
      position: {
        lat: treasure.lat,
        lng: treasure.lng,
        accuracy: 5,
        timestamp: Date.now(),
      },
    };
    const results = await Promise.all([
      call("workshopAction", data, adminToken),
      call("workshopAction", data, memberToken),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const state = (await db.doc("workshops/main").get()).data();
    expect(state.members["dave.h"].score + state.members["alex.k"].score).toBe(
      treasure.points,
    );
  }, 30000);
  it("persists a bomb lock and rejects discovery attempts during the lock", async () => {
    const bomb = makeSeed(true).treasures[2];
    const result = await call(
      "workshopAction",
      {
        action: "claim",
        treasureId: bomb.id,
        position: {
          lat: bomb.lat,
          lng: bomb.lng,
          accuracy: 5,
          timestamp: Date.now(),
        },
      },
      memberToken,
    );
    expect(result.result.result.outcome).toBe("bomb");
    expect(result.result.result.blockedUntil).toBeGreaterThan(
      Date.now() + 295000,
    );
    const t = makeSeed(true).treasures[1];
    expect(
      (
        await call(
          "workshopAction",
          {
            action: "claim",
            treasureId: t.id,
            position: {
              lat: t.lat,
              lng: t.lng,
              accuracy: 5,
              timestamp: Date.now(),
            },
          },
          memberToken,
        )
      ).status,
    ).not.toBe(200);
  });
  it("invalidates both the old code and old sessions after link rotation", async () => {
    const rotated = await call(
      "workshopAction",
      { action: "rotateInvite", memberId: "alex.k" },
      adminToken,
    );
    expect(rotated.status).toBe(200);
    expect((await call("redeemInvite", { code: memberCode })).status).toBe(401);
    expect(
      (
        await call(
          "workshopAction",
          { action: "registerPush", token: "a-valid-length-token-for-test" },
          memberToken,
        )
      ).status,
    ).toBe(401);
    expect(await redeem(rotated.result.code)).toBeTruthy();
  });
  it("keeps privileged roles in server-owned records", async () => {
    const r = await call(
      "workshopAction",
      { action: "setRole", memberId: "june.p", role: "admin" },
      adminToken,
    );
    expect(r.status).toBe(200);
    expect((await db.doc("members/june.p").get()).data().role).toBe("admin");
  });
});
