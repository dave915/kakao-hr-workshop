import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { makeSeed, demoSecrets } from "../shared/seed";
import type { Treasure, WorkshopState } from "../shared/types";
import { registrationValues } from "../shared/treasure-registration";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
// Pages only installs frontend dependencies; load the Admin SDK when this suite runs.
const initializeApp = (options: Record<string, unknown>) =>
  require("firebase-admin/app").initializeApp(options);
const getFirestore = () => require("firebase-admin/firestore").getFirestore();
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
    adminCode: string,
    committeeCode: string,
    memberToken: string,
    memberCode: string;
  beforeAll(async () => {
    initializeApp({ projectId: "demo-workshop" });
    db = getFirestore();
    const state = makeSeed(true);
    const batch = db.batch();
    batch.set(db.doc("workshops/main"), state);
    batch.set(db.doc("private/treasures"), { kinds: demoSecrets });
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
      if (m.id === "june.p") committeeCode = code;
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
  it("saves a batch to both views and private kinds, and rejects invalid or participant batches atomically", async () => {
    const originalState = (
      await db.doc("workshops/main").get()
    ).data() as WorkshopState;
    const originalSecrets = (await db.doc("private/treasures").get()).data();
    const first = {
      id: "batch-a",
      name: "보물 A",
      hint: "나무 아래",
      lat: 37.54,
      lng: 127.04,
      points: 200,
      radius: 40,
      kind: "treasure",
    };
    const second = { ...first, id: "batch-b", name: "보물 B", kind: "bomb" };
    const input = {
      action: "saveTreasures",
      resetGeneration: 0,
      treasures: [first, second],
    };
    try {
      expect(
        (await call("workshopAction", input, memberToken)).status,
      ).not.toBe(200);
      expect(
        (
          await call(
            "workshopAction",
            { ...input, treasures: [first, { ...second, radius: 1 }] },
            adminToken,
          )
        ).status,
      ).not.toBe(200);
      expect((await db.doc("workshops/main").get()).data()).toEqual(
        originalState,
      );
      expect((await call("workshopAction", input, adminToken)).status).toBe(
        200,
      );
      const saved = (
        await db.doc("workshops/main").get()
      ).data() as WorkshopState;
      expect(saved.treasures.slice(-2).map((t) => t.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(
        (await db.doc("private/treasures").get()).data().kinds[second.id],
      ).toBe("bomb");
      const visible = (await db.doc("workshops/participants").get()).data();
      expect(
        visible.treasures.find((t: Treasure) => t.id === second.id),
      ).not.toHaveProperty("lat");
      expect(
        visible.treasures.find((t: Treasure) => t.id === second.id),
      ).not.toHaveProperty("kind");
      expect((await call("workshopAction", input, adminToken)).status).toBe(
        200,
      );
      expect((await db.doc("workshops/main").get()).data()).toEqual(saved);
      const existing = saved.treasures.find((t) => t.id === first.id)!;
      const original = registrationValues(existing, "treasure");
      existing.foundBy = "alex.k";
      existing.foundAt = Date.now();
      existing.outcome = "treasure";
      await db.doc("workshops/main").set(saved);
      const conflict = {
        ...input,
        treasures: [
          { ...second, id: "partial-must-not-exist" },
          { ...first, hint: "바뀐 힌트", original },
        ],
      };
      expect(
        (await call("workshopAction", conflict, adminToken)).status,
      ).not.toBe(200);
      expect((await db.doc("workshops/main").get()).data()).toEqual(saved);
      expect(
        (await db.doc("private/treasures").get()).data().kinds,
      ).not.toHaveProperty("partial-must-not-exist");
      expect((await call("workshopAction", input, adminToken)).status).toBe(
        200,
      );
      expect((await db.doc("workshops/main").get()).data()).toEqual(saved);
    } finally {
      const restore = db.batch();
      restore.set(db.doc("workshops/main"), originalState);
      restore.set(db.doc("private/treasures"), originalSecrets);
      // The next normal mutation regenerates the participant view.
      await restore.commit();
    }
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
  it("returns approximate guidance without publishing hidden positions or writing movement history", async () => {
    const stateBefore = (await db.doc("workshops/main").get()).data();
    const t = stateBefore.treasures.find((t: { id: string }) => t.id === "t2");
    const r = await call(
      "workshopAction",
      {
        action: "getGuidance",
        treasureId: t.id,
        position: {
          lat: t.lat - 0.002,
          lng: t.lng,
          accuracy: 5,
          timestamp: Date.now(),
        },
      },
      memberToken,
    );
    expect(r.status).toBe(200);
    expect(r.result.guidance.direction).toBe("북쪽");
    expect(r.result.guidance).not.toHaveProperty("lat");
    expect(r.result.guidance).not.toHaveProperty("lng");
    expect((await db.doc("workshops/main").get()).data()).toEqual(stateBefore);
    const publicState = (await db.doc("workshops/participants").get()).data();
    expect(
      publicState.treasures.every(
        (t: object) => !("lat" in t) && !("lng" in t),
      ),
    ).toBe(true);
  });
  it("serves only a nearby selected AR target through an authenticated read without changing state", async () => {
    const before = (await db.doc("workshops/main").get()).data();
    const target = before.treasures.find((t: { id: string }) => t.id === "t3");
    const input = {
      action: "getArTarget",
      treasureId: target.id,
      position: {
        lat: target.lat,
        lng: target.lng,
        accuracy: 5,
        timestamp: Date.now(),
      },
    };
    expect((await call("workshopAction", input)).status).toBe(401);
    const near = await call("workshopAction", input, memberToken);
    expect(near.status).toBe(200);
    expect(near.result.arTarget).toMatchObject({
      treasureId: target.id,
      lat: target.lat,
      lng: target.lng,
    });
    expect(near.result.arTarget).not.toHaveProperty("kind");
    expect(near.result.arTarget).not.toHaveProperty("outcome");
    const far = await call(
      "workshopAction",
      { ...input, position: { ...input.position, lat: target.lat - 0.01 } },
      memberToken,
    );
    expect(far.status).toBe(200);
    expect(far.result.arTarget).toBeNull();
    expect(
      (
        await call(
          "workshopAction",
          { ...input, position: { ...input.position, accuracy: 50 } },
          memberToken,
        )
      ).status,
    ).not.toBe(200);
    expect((await db.doc("workshops/main").get()).data()).toEqual(before);
    const publicState = (await db.doc("workshops/participants").get()).data();
    expect(
      publicState.treasures.every(
        (t: object) => !("lat" in t) && !("lng" in t),
      ),
    ).toBe(true);
  });
  it("rejects legacy map claims even when the user is at the treasure", async () => {
    const before = (await db.doc("workshops/main").get()).data();
    const treasure = before.treasures[0];
    const response = await call(
      "workshopAction",
      {
        action: "claim",
        treasureId: treasure.id,
        position: {
          lat: treasure.lat,
          lng: treasure.lng,
          accuracy: 5,
          timestamp: Date.now(),
        },
      },
      memberToken,
    );
    expect(response.status).toBe(400);
    expect(response.error.message).toContain("카메라");
    expect((await db.doc("workshops/main").get()).data()).toEqual(before);
  });
  it("serializes simultaneous camera discoveries so exactly one person wins", async () => {
    const treasure = makeSeed(true).treasures[0];
    const data = {
      action: "claimCamera",
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
  it("reveals exactly the discovered location after an atomic claim", async () => {
    const publicState = (await db.doc("workshops/participants").get()).data();
    expect(
      publicState.treasures
        .filter((t: { lat?: number }) => t.lat !== undefined)
        .map((t: { id: string }) => t.id),
    ).toEqual(["t1"]);
  });
  it("persists a bomb lock and rejects discovery attempts during the lock", async () => {
    const bomb = makeSeed(true).treasures[2];
    const result = await call(
      "workshopAction",
      {
        action: "claimCamera",
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
            action: "claimCamera",
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
    memberCode = rotated.result.code;
    memberToken = await redeem(memberCode);
    expect(memberToken).toBeTruthy();
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
  it("enforces individual deletion permissions and preserves superadmin access", async () => {
    const committeeToken = await redeem(committeeCode);
    const created = await call(
      "workshopAction",
      {
        action: "createMember",
        member: {
          name: "Delete Admin",
          handle: "delete.admin",
          team: "테스트팀",
        },
      },
      adminToken,
    );
    expect(created.status).toBe(200);
    const id = created.result.memberId;
    expect(
      (
        await call(
          "workshopAction",
          { action: "setRole", memberId: id, role: "admin" },
          adminToken,
        )
      ).status,
    ).toBe(200);
    const before = (await db.doc("workshops/main").get()).data();
    for (const [token, memberId] of [
      [memberToken, id],
      [committeeToken, id],
      [committeeToken, "june.p"],
      [adminToken, "dave.h"],
    ]) {
      expect(
        (
          await call(
            "workshopAction",
            { action: "deleteMember", memberId },
            token,
          )
        ).status,
      ).not.toBe(200);
      expect((await db.doc("workshops/main").get()).data()).toEqual(before);
    }
    expect(
      (
        await call(
          "workshopAction",
          { action: "deleteMember", memberId: id },
          adminToken,
        )
      ).status,
    ).toBe(200);
    expect((await db.doc(`members/${id}`).get()).exists).toBe(false);
    expect((await db.doc("members/dave.h").get()).data().role).toBe(
      "superadmin",
    );
    expect(await redeem(adminCode)).toBeTruthy();
  });
  it("atomically deletes a participant, all of their links and devices, while preserving claimed prizes", async () => {
    const committeeToken = await redeem(committeeCode);
    const created = await call(
      "workshopAction",
      {
        action: "createMember",
        member: {
          name: "Delete Member",
          handle: "delete.member",
          team: "삭제 테스트",
        },
      },
      adminToken,
    );
    expect(created.status).toBe(200);
    const id = created.result.memberId;
    const firstToken = await redeem(created.result.code);
    expect(
      (
        await call(
          "workshopAction",
          { action: "registerPush", token: "first-device-for-deleted-member" },
          firstToken,
        )
      ).status,
    ).toBe(200);
    const rotated = await call(
      "workshopAction",
      { action: "rotateInvite", memberId: id },
      adminToken,
    );
    expect(rotated.status).toBe(200);
    const currentToken = await redeem(rotated.result.code);
    expect(
      (
        await call(
          "workshopAction",
          { action: "registerPush", token: "second-device-for-deleted-member" },
          currentToken,
        )
      ).status,
    ).toBe(200);
    await db
      .doc("pushTokens/admin-device")
      .set({ uid: "dave.h", token: "admin-device-token" });
    const treasure = makeSeed(true).treasures.find((t) => t.id === "t4")!;
    const claim = {
      action: "claimCamera",
      treasureId: treasure.id,
      position: {
        lat: treasure.lat,
        lng: treasure.lng,
        accuracy: 5,
        timestamp: Date.now(),
      },
    };
    expect((await call("workshopAction", claim, currentToken)).status).toBe(
      200,
    );
    const before = (await db.doc("workshops/main").get()).data();
    const remainingMembers = { ...before.members };
    delete remainingMembers[id];
    expect(
      (await db.collection("invites").where("uid", "==", id).get()).size,
    ).toBe(2);
    expect(
      (await db.collection("pushTokens").where("uid", "==", id).get()).size,
    ).toBe(2);
    expect(
      (
        await call(
          "workshopAction",
          { action: "deleteMember", memberId: id },
          committeeToken,
        )
      ).status,
    ).toBe(200);
    for (const path of ["workshops/main", "workshops/participants"]) {
      const state = (await db.doc(path).get()).data();
      expect(state.members).toEqual(remainingMembers);
      expect(
        state.treasures.find((t: { id: string }) => t.id === treasure.id),
      ).toEqual(
        before.treasures.find((t: { id: string }) => t.id === treasure.id),
      );
    }
    expect((await db.doc(`members/${id}`).get()).exists).toBe(false);
    expect(
      (await db.collection("invites").where("uid", "==", id).get()).empty,
    ).toBe(true);
    expect(
      (await db.collection("pushTokens").where("uid", "==", id).get()).empty,
    ).toBe(true);
    expect((await db.doc("pushTokens/admin-device").get()).data().uid).toBe(
      "dave.h",
    );
    for (const code of [created.result.code, rotated.result.code])
      expect((await call("redeemInvite", { code })).status).toBe(401);
    expect(
      (
        await call(
          "workshopAction",
          { action: "registerPush", token: "revoked-deleted-member-device" },
          currentToken,
        )
      ).status,
    ).toBe(401);
    const read = await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-workshop/databases/(default)/documents/workshops/participants`,
      { headers: { Authorization: `Bearer ${currentToken}` } },
    );
    expect(read.status).toBe(403);
    expect((await call("workshopAction", claim, adminToken)).status).not.toBe(
      200,
    );
  }, 30000);
  it("deletes notices and claimed treasures in both views and corrects only the awarded score", async () => {
    const committeeToken = await redeem(committeeCode);
    const before = (await db.doc("workshops/main").get()).data();
    const treasure = before.treasures.find(
      (t: { id: string }) => t.id === "t1",
    );
    const finder = before.members[treasure.foundBy];
    for (const input of [
      { action: "deleteNotice", id: "n1" },
      { action: "deleteTreasure", id: "t1" },
    ]) {
      expect(
        (await call("workshopAction", input, memberToken)).status,
      ).not.toBe(200);
      expect((await call("workshopAction", input, committeeToken)).status).toBe(
        200,
      );
    }
    for (const path of ["workshops/main", "workshops/participants"]) {
      const state = (await db.doc(path).get()).data();
      expect(state.notices.some((n: { id: string }) => n.id === "n1")).toBe(
        false,
      );
      expect(state.treasures.some((t: { id: string }) => t.id === "t1")).toBe(
        false,
      );
      expect(state.members[finder.id].score).toBe(
        finder.score - treasure.points,
      );
      expect(state.members[finder.id].found).toBe(finder.found - 1);
    }
    expect(
      (await db.doc("private/treasures").get()).data().kinds,
    ).not.toHaveProperty("t1");
  });
  it("requires superadmin permission and explicit confirmation before any reset writes", async () => {
    const before = (await db.doc("workshops/main").get()).data();
    const input = { action: "resetWorkshop", confirmation: "전체 초기화" };
    for (const token of [memberToken, await redeem(committeeCode)]) {
      expect((await call("workshopAction", input, token)).status).not.toBe(200);
    }
    expect(
      (await call("workshopAction", { action: "resetWorkshop" }, adminToken))
        .status,
    ).toBe(400);
    expect((await db.doc("workshops/main").get()).data()).toEqual(before);
  });
  it("atomically resets a full workshop, revokes removed sessions and preserves superadmin access", async () => {
    const committeeToken = await redeem(committeeCode);
    const adminProfile = (await db.doc("members/dave.h").get()).data();
    const state = (await db.doc("workshops/main").get()).data();
    const writer = db.bulkWriter();
    // Exercise the 500-person capacity, including more than 500 document deletes.
    for (let i = Object.keys(state.members).length; i < 500; i++) {
      const uid = `reset-member-${i}`;
      state.members[uid] = { ...state.members["alex.k"], id: uid, handle: uid };
      writer.set(db.doc(`members/${uid}`), {
        role: "member",
        sessionVersion: 1,
      });
      writer.set(db.doc(`invites/reset-invite-${i}`), {
        uid,
        sessionVersion: 1,
        expiresAt: Date.now() + 86400000,
      });
    }
    writer.set(db.doc("members/orphan"), { role: "admin", sessionVersion: 1 });
    writer.set(db.doc("invites/orphan"), { uid: "orphan" });
    writer.set(db.doc("pushTokens/member-device"), {
      uid: "alex.k",
      token: "member-device-token",
    });
    writer.set(db.doc("pushTokens/admin-device"), {
      uid: "dave.h",
      token: "admin-device-token",
    });
    writer.set(db.doc("workshops/main"), state);
    await writer.close();
    const reset = await call(
      "workshopAction",
      { action: "resetWorkshop", confirmation: "전체 초기화" },
      adminToken,
    );
    expect(reset.status).toBe(200);
    const expected = {
      ...makeSeed(false),
      resetGeneration: 1,
      members: {
        "dave.h": {
          ...state.members["dave.h"],
          team: "미배정",
          score: 0,
          found: 0,
          blockedUntil: 0,
        },
      },
    };
    expect((await db.doc("workshops/main").get()).data()).toEqual(expected);
    expect((await db.doc("workshops/participants").get()).data()).toEqual(
      expected,
    );
    expect((await db.doc("private/treasures").get()).data()).toEqual({
      kinds: {},
    });
    expect(
      (await db.collection("members").get()).docs.map(
        (d: { id: string }) => d.id,
      ),
    ).toEqual(["dave.h"]);
    expect((await db.doc("members/dave.h").get()).data()).toEqual(adminProfile);
    expect(
      (await db.collection("pushTokens").get()).docs.map(
        (d: { id: string }) => d.id,
      ),
    ).toEqual(["admin-device"]);
    const invites = (await db.collection("invites").get()).docs;
    expect(invites).toHaveLength(1);
    expect(invites[0].id).toBe(hash(adminCode));
    expect((await call("redeemInvite", { code: memberCode })).status).toBe(401);
    expect((await call("redeemInvite", { code: committeeCode })).status).toBe(
      401,
    );
    for (const token of [memberToken, committeeToken]) {
      expect(
        (
          await call(
            "workshopAction",
            { action: "registerPush", token: "deleted-user-device-token" },
            token,
          )
        ).status,
      ).toBe(401);
      const read = await fetch(
        `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-workshop/databases/(default)/documents/workshops/participants`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(read.status).toBe(403);
    }
    expect(await redeem(adminCode)).toBeTruthy();
    expect(
      (
        await call(
          "workshopAction",
          {
            action: "createMember",
            member: { name: "다시 초대", handle: "alex.k", team: "새 팀" },
          },
          adminToken,
        )
      ).status,
    ).toBe(200);
  }, 30000);
});
