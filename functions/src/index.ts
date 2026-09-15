import {
  arGuidance,
  participantView,
  treasureGuidance,
} from "../../shared/exploration";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { actionInput } from "../../shared/validation";
import { mutate } from "../../shared/mutate";
import { GameError, isAdmin } from "../../shared/game";
import type {
  ActionResponse,
  TreasureSecrets,
  WorkshopState,
} from "../../shared/types";
initializeApp();
setGlobalOptions({
  region: "asia-northeast3",
  maxInstances: 3,
  serviceAccount: process.env.WORKSHOP_RUNTIME_SERVICE_ACCOUNT,
});
const db = getFirestore();
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const stateRef = db.doc("workshops/main");
const secretsRef = db.doc("private/treasures");
const participantRef = db.doc("workshops/participants");
function writeState(tx: FirebaseFirestore.Transaction, state: WorkshopState) {
  tx.set(stateRef, state);
  tx.set(participantRef, participantView(state));
}

export const redeemInvite = onCall({ cors: true }, async (request) => {
  const code = request.data?.code;
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(code))
    throw new HttpsError("unauthenticated", "입장 코드를 확인해주세요.");
  const now = Date.now();
  // Throttle unauthenticated guesses without persisting raw IP addresses.
  const key = hash(
    `${request.rawRequest.ip || "unknown"}:${Math.floor(now / 600000)}`,
  );
  const rateRef = db.doc(`loginLimits/${key}`);
  const rate = await rateRef.get();
  if ((rate.data()?.count || 0) >= 30)
    throw new HttpsError(
      "resource-exhausted",
      "입장 시도가 너무 많아요. 10분 후 다시 시도해주세요.",
    );
  const session = await db
    .runTransaction(async (tx) => {
      const invite = await tx.get(db.doc(`invites/${hash(code)}`));
      const value = invite.data();
      if (!value || value.expiresAt < now)
        throw new HttpsError(
          "unauthenticated",
          "만료되었거나 재발급된 입장 링크예요. 추진위원회에 새 링크를 요청해주세요.",
        );
      const [memberSnap, stateSnap] = await Promise.all([
        tx.get(db.doc(`members/${value.uid}`)),
        tx.get(stateRef),
      ]);
      const member = memberSnap.data();
      const state = stateSnap.data() as WorkshopState | undefined;
      if (
        !member ||
        member.sessionVersion !== value.sessionVersion ||
        !state?.members[value.uid]
      )
        throw new HttpsError(
          "unauthenticated",
          "사용할 수 없는 입장 링크예요.",
        );
      state.members[value.uid].joined = true;
      writeState(tx, state);
      return {
        uid: value.uid as string,
        version: member.sessionVersion as number,
      };
    })
    .catch(async (error) => {
      // Successful arrivals from shared workshop Wi-Fi do not consume the failed-login budget.
      if (error instanceof HttpsError && error.code === "unauthenticated")
        await rateRef.set(
          {
            count: FieldValue.increment(1),
            expiresAt: new Date(now + 3600000),
          },
          { merge: true },
        );
      throw error;
    });
  const token = await getAuth().createCustomToken(session.uid, {
    sessionVersion: session.version,
  });
  return { token };
});

export const workshopAction = onCall(
  { cors: true, timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth)
      throw new HttpsError(
        "unauthenticated",
        "개인 입장 링크로 먼저 접속해주세요.",
      );
    if (request.data?.action === "claim")
      throw new HttpsError(
        "failed-precondition",
        "보물은 카메라를 켜고 획득할 수 있어요. 앱을 업데이트한 뒤 다시 시도해주세요.",
      );
    const parsed = actionInput.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", parsed.error.issues[0].message);
    const input = parsed.data;
    const uid = request.auth.uid;
    const sessionVersion = request.auth.token.sessionVersion;
    const id = randomUUID();
    const code = randomBytes(24).toString("base64url");
    const now = Date.now();
    let result: ActionResponse;
    try {
      if (input.action === "getGuidance" || input.action === "getArTarget") {
        const [memberSnapshot, stateSnapshot] = await Promise.all([
          db.doc(`members/${uid}`).get(),
          stateRef.get(),
        ]);
        if (
          !memberSnapshot.exists ||
          memberSnapshot.data()?.sessionVersion !== sessionVersion
        )
          throw new HttpsError(
            "unauthenticated",
            "새 입장 링크로 다시 입장해주세요.",
          );
        if (!stateSnapshot.exists)
          throw new HttpsError(
            "failed-precondition",
            "워크샵 정보를 찾을 수 없어요.",
          );
        if (input.action === "getArTarget")
          return arGuidance(
            stateSnapshot.data() as WorkshopState,
            uid,
            input.treasureId,
            input.position,
            now,
          );
        return {
          guidance: treasureGuidance(
            stateSnapshot.data() as WorkshopState,
            uid,
            input.treasureId,
            input.position,
            now,
          ),
        };
      }
      result = await db.runTransaction(async (tx) => {
        const [userSnap, stateSnap, secretSnap] = await Promise.all([
          tx.get(db.doc(`members/${uid}`)),
          tx.get(stateRef),
          tx.get(secretsRef),
        ]);
        const user = userSnap.data();
        const state = stateSnap.data() as WorkshopState | undefined;
        if (!user || user.sessionVersion !== sessionVersion)
          throw new HttpsError(
            "unauthenticated",
            "입장 링크가 갱신되었어요. 새 링크로 다시 입장해주세요.",
          );
        if (!state?.members[uid])
          throw new HttpsError(
            "failed-precondition",
            "참가자 정보를 찾을 수 없어요.",
          );
        const secrets = (secretSnap.data()?.kinds ?? {}) as TreasureSecrets;
        // All reads precede writes, including the target of a link rotation.
        const targetSnap =
          input.action === "rotateInvite"
            ? await tx.get(db.doc(`members/${input.memberId}`))
            : null;
        const response = mutate(state, secrets, uid, input, id, now);
        if (input.action === "deleteMember") {
          const [invites, pushTokens] = await Promise.all([
            tx.get(db.collection("invites").where("uid", "==", input.memberId)),
            tx.get(
              db.collection("pushTokens").where("uid", "==", input.memberId),
            ),
          ]);
          tx.delete(db.doc(`members/${input.memberId}`));
          for (const invite of invites.docs) tx.delete(invite.ref);
          for (const token of pushTokens.docs) tx.delete(token.ref);
        }
        if (input.action === "resetWorkshop") {
          // Read and delete in the same transaction as the state reset so old
          // links and sessions lose access atomically, including admin sessions.
          const [members, invites, pushTokens] = await Promise.all([
            tx.get(db.collection("members")),
            tx.get(db.collection("invites")),
            tx.get(db.collection("pushTokens")),
          ]);
          for (const member of members.docs)
            if (!state.members[member.id]) tx.delete(member.ref);
          for (const invite of invites.docs)
            if (!state.members[invite.data().uid]) tx.delete(invite.ref);
          for (const token of pushTokens.docs)
            if (!state.members[token.data().uid]) tx.delete(token.ref);
        }
        if (
          input.action === "registerPush" ||
          input.action === "unregisterPush"
        ) {
          const tokenRef = db.doc(`pushTokens/${hash(input.token)}`);
          if (input.action === "unregisterPush") {
            const tokenSnap = await tx.get(tokenRef);
            if (tokenSnap.data()?.uid === uid) tx.delete(tokenRef);
          } else tx.set(tokenRef, { token: input.token, uid, updatedAt: now });
          return response;
        }
        if (
          input.action === "createMember" ||
          input.action === "rotateInvite"
        ) {
          const targetId = response.memberId!;
          const member = state.members[targetId];
          const version =
            input.action === "rotateInvite"
              ? (targetSnap?.data()?.sessionVersion ?? 0) + 1
              : 1;
          tx.set(db.doc(`members/${targetId}`), {
            role: member.role,
            sessionVersion: version,
          });
          tx.create(db.doc(`invites/${hash(code)}`), {
            uid: targetId,
            sessionVersion: version,
            expiresAt: Math.max(
              Date.parse(state.settings.endsAt) + 86400000,
              now + 30 * 86400000,
            ),
          });
          response.code = code;
        }
        if (input.action === "setRole")
          tx.update(db.doc(`members/${input.memberId}`), { role: input.role });
        writeState(tx, state);
        if (
          input.action === "saveTreasure" ||
          input.action === "saveTreasures" ||
          input.action === "deleteTreasure" ||
          input.action === "resetWorkshop"
        )
          tx.set(secretsRef, { kinds: secrets });
        if (isAdmin(state.members[uid]))
          tx.create(db.collection("audit").doc(), {
            actor: uid,
            action: input.action,
            at: now,
            target:
              "memberId" in input
                ? input.memberId
                : "id" in input
                  ? input.id
                  : null,
          });
        return response;
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof GameError)
        throw new HttpsError("failed-precondition", e.message);
      throw new HttpsError(
        "internal",
        "저장하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    }
    if (input.action === "publishNotice" && input.push && result.noticeId) {
      let delivered = 0,
        failed = 0;
      try {
        const [tokensSnap, stateSnap] = await Promise.all([
          db.collection("pushTokens").get(),
          stateRef.get(),
        ]);
        const state = stateSnap.data() as WorkshopState;
        const tokens = tokensSnap.docs.filter((t) => {
          const p = state.members[t.data().uid];
          return (
            state.notices.some((n) => n.id === result.noticeId) &&
            p &&
            (input.audience === "all" || p.team === input.audience)
          );
        });
        for (let i = 0; i < tokens.length; i += 500) {
          const batch = tokens.slice(i, i + 500);
          const response = await getMessaging().sendEachForMulticast({
            tokens: batch.map((t) => t.data().token),
            data: {
              title: input.title,
              body:
                Array.from(input.body).slice(0, 180).join("") +
                (Array.from(input.body).length > 180 ? "…" : ""),
              noticeId: result.noticeId,
            },
            webpush: { headers: { TTL: "86400", Urgency: "high" } },
          });
          delivered += response.successCount;
          failed += response.failureCount;
          await Promise.all(
            response.responses.map((r, index) =>
              !r.success &&
              [
                "messaging/registration-token-not-registered",
                "messaging/invalid-registration-token",
              ].includes(r.error?.code ?? "")
                ? batch[index].ref.delete()
                : Promise.resolve(),
            ),
          );
        }
      } catch {
        failed += 1;
      }
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(stateRef);
        const state = snap.data() as WorkshopState;
        const n = state.notices.find((n) => n.id === result.noticeId);
        if (n) {
          n.pushStatus = failed ? (delivered ? "partial" : "failed") : "sent";
          n.delivered = delivered;
          n.failed = failed;
          writeState(tx, state);
        }
      });
      result.delivered = delivered;
      result.failed = failed;
    }
    return result;
  },
);
