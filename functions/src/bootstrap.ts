import { participantView } from "../../shared/exploration";
import { randomBytes, createHash } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { makeSeed } from "../../shared/seed";
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
const baseUrl = process.env.WORKSHOP_URL;
if (!projectId || !baseUrl)
  throw new Error(
    "GOOGLE_CLOUD_PROJECT and WORKSHOP_URL are required. Authenticate with Application Default Credentials.",
  );
const url = new URL(baseUrl);
if (url.protocol !== "https:" && url.hostname !== "localhost")
  throw new Error("Use an HTTPS workshop URL.");
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const code = randomBytes(24).toString("base64url");
const uid = "dave.h";
const state = makeSeed(false);
state.members[uid] = {
  id: uid,
  name: "데이브",
  handle: "dave.h",
  team: "추진위원회",
  role: "superadmin",
  score: 0,
  found: 0,
  blockedUntil: 0,
  joined: false,
};
async function main() {
  await db.runTransaction(async (tx) => {
    const [old, member] = await Promise.all([
      tx.get(db.doc("workshops/main")),
      tx.get(db.doc(`members/${uid}`)),
    ]);
    if (process.argv.includes("--recover")) {
      if (!old.exists || member.data()?.role !== "superadmin")
        throw new Error("No existing superadmin to recover.");
      const version = member.data()!.sessionVersion + 1;
      tx.update(db.doc(`members/${uid}`), { sessionVersion: version });
      tx.create(
        db.doc(`invites/${createHash("sha256").update(code).digest("hex")}`),
        { uid, sessionVersion: version, expiresAt: Date.now() + 30 * 86400000 },
      );
      return;
    }
    if (old.exists || member.exists)
      throw new Error(
        "Already initialized; refusing to overwrite workshop or superadmin.",
      );
    tx.create(db.doc("workshops/main"), state);
    tx.create(db.doc("workshops/participants"), participantView(state));
    tx.create(db.doc("private/treasures"), { kinds: {} });
    tx.create(db.doc(`members/${uid}`), {
      role: "superadmin",
      sessionVersion: 1,
    });
    tx.create(
      db.doc(`invites/${createHash("sha256").update(code).digest("hex")}`),
      { uid, sessionVersion: 1, expiresAt: Date.now() + 30 * 86400000 },
    );
  });
  url.hash = `/join/${code}`;
  // This credential is printed only on this trusted operator's terminal, never stored in source or CI logs.
  console.log(
    "dave.h login ready. Keep this personal login URL private:\n" + url.href,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
