import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
describe.skipIf(!enabled)("Firestore security rules", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-workshop",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await Promise.all([
        setDoc(doc(db, "members", "member"), {
          role: "member",
          sessionVersion: 1,
        }),
        setDoc(doc(db, "members", "admin"), {
          role: "admin",
          sessionVersion: 1,
        }),
        setDoc(doc(db, "workshops", "main"), { version: 1 }),
        setDoc(doc(db, "workshops", "participants"), { version: 1 }),
        setDoc(doc(db, "private", "treasures"), { kinds: { secret: "bomb" } }),
        setDoc(doc(db, "invites", "secret"), { uid: "admin" }),
      ]);
    });
  });
  afterAll(async () => {
    await env?.cleanup();
  });
  it("rejects unauthenticated workshop reads", async () => {
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore(), "workshops", "main"),
      ),
    );
  });
  it("allows participants to read only the redacted workshop view", async () => {
    await assertSucceeds(
      getDoc(
        doc(
          env.authenticatedContext("member", { sessionVersion: 1 }).firestore(),
          "workshops",
          "participants",
        ),
      ),
    );
  });
  it("rejects a revoked login version", async () => {
    await assertFails(
      getDoc(
        doc(
          env.authenticatedContext("member", { sessionVersion: 0 }).firestore(),
          "workshops",
          "participants",
        ),
      ),
    );
  });
  it("keeps bomb types and invite secrets private from members", async () => {
    const db = env
      .authenticatedContext("member", { sessionVersion: 1 })
      .firestore();
    await assertFails(getDoc(doc(db, "private", "treasures")));
    await assertFails(getDoc(doc(db, "invites", "secret")));
    await assertFails(getDoc(doc(db, "devices", "private-device")));
    await assertFails(getDoc(doc(db, "memberImports", "private-import")));
  });
  it("allows admins to inspect bomb types but never read invitation tokens", async () => {
    const db = env
      .authenticatedContext("admin", { sessionVersion: 1 })
      .firestore();
    await assertSucceeds(getDoc(doc(db, "private", "treasures")));
    await assertFails(getDoc(doc(db, "invites", "secret")));
  });
  it("denies participants the full coordinates even with a forged role claim", async () => {
    const db = env
      .authenticatedContext("member", { sessionVersion: 1, role: "superadmin" })
      .firestore();
    await assertFails(getDoc(doc(db, "workshops", "main")));
  });
  it("allows a member to read only their own profile and allows admins to read the canonical view", async () => {
    const member = env
      .authenticatedContext("member", { sessionVersion: 1 })
      .firestore();
    await assertSucceeds(getDoc(doc(member, "members", "member")));
    await assertFails(getDoc(doc(member, "members", "admin")));
    await assertSucceeds(
      getDoc(
        doc(
          env.authenticatedContext("admin", { sessionVersion: 1 }).firestore(),
          "workshops",
          "main",
        ),
      ),
    );
  });
  it("rejects direct client score, role and secret writes, including admins", async () => {
    for (const id of ["member", "admin"]) {
      const db = env
        .authenticatedContext(id, { sessionVersion: 1 })
        .firestore();
      await assertFails(setDoc(doc(db, "workshops", "main"), { score: 999 }));
      await assertFails(
        setDoc(doc(db, "workshops", "participants"), { score: 999 }),
      );
      await assertFails(
        setDoc(doc(db, "members", id), {
          role: "superadmin",
          sessionVersion: 1,
        }),
      );
      await assertFails(setDoc(doc(db, "private", "treasures"), {}));
    }
  });
});
