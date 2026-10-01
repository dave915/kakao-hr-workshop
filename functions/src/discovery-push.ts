import { createHash, randomUUID } from "node:crypto";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import {
  getMessaging,
  type BatchResponse,
  type MulticastMessage,
} from "firebase-admin/messaging";
import {
  discoveryRecipients,
  type DiscoveryPush,
  type PushRegistration,
} from "../../shared/discovery-push";
import type { WorkshopState } from "../../shared/types";

type Sender = (message: MulticastMessage) => Promise<BatchResponse>;
const MAX_ATTEMPTS = 5;
const MAX_AGE = 30 * 60 * 1000;
const LEASE_TIME = 150000; // Longer than this function's 120-second timeout.
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const terminal = (status: DiscoveryPush["status"]) =>
  ["sent", "partial", "failed", "cancelled"].includes(status);
function currentDiscovery(
  state: WorkshopState | undefined,
  job: DiscoveryPush,
): state is WorkshopState {
  const treasure = state?.treasures.find((t) => t.id === job.treasureId);
  return Boolean(
    state &&
    (state.resetGeneration ?? 0) === job.resetGeneration &&
    treasure?.foundBy === job.finderId &&
    treasure.foundAt === job.foundAt,
  );
}

export function discoveryPushId(job: DiscoveryPush) {
  return hash(
    `${job.resetGeneration}:${job.treasureId}:${job.finderId}:${job.foundAt}`,
  );
}

const send: Sender = async (message) => {
  // The emulator must never deliver fixture notifications to real devices.
  if (process.env.FUNCTIONS_EMULATOR === "true")
    return {
      successCount: message.tokens.length,
      failureCount: 0,
      responses: message.tokens.map(() => ({
        success: true,
        messageId: "emulated",
      })),
    };
  return getMessaging().sendEachForMulticast(message);
};

/** A durable job separates winning the treasure from notification availability. */
export async function dispatchDiscoveryPush(
  ref: DocumentReference,
  sender: Sender = send,
) {
  const db = getFirestore();
  const leaseId = randomUUID();
  const acquired = await db.runTransaction(async (tx) => {
    const [snapshot, stateSnapshot] = await Promise.all([
      tx.get(ref),
      tx.get(db.doc("workshops/main")),
    ]);
    if (!snapshot.exists) return null;
    const job = snapshot.data() as DiscoveryPush;
    if (terminal(job.status)) return null;
    const state = stateSnapshot.data() as WorkshopState | undefined;
    if (!currentDiscovery(state, job)) {
      tx.update(ref, {
        status: "cancelled",
        reason: "discovery-changed",
        finishedAt: Date.now(),
      });
      return null;
    }
    if (job.status === "sending" && (job.leaseUntil ?? 0) > Date.now())
      throw new Error(
        "Discovery push is already being delivered; retry later.",
      );
    if (Date.now() - job.createdAt >= MAX_AGE || job.attempts >= MAX_ATTEMPTS) {
      tx.update(ref, {
        status: job.deliveredTokenIds.length ? "partial" : "failed",
        reason: "retry-limit",
        finishedAt: Date.now(),
      });
      return null;
    }
    const attempts = job.attempts + 1;
    tx.update(ref, {
      status: "sending",
      attempts,
      leaseId,
      leaseUntil: Date.now() + LEASE_TIME,
    });
    return { job: { ...job, attempts }, state };
  });
  if (!acquired) return;
  const { job, state } = acquired;
  const delivered = new Set(job.deliveredTokenIds);
  const rejected = new Set(job.rejectedTokenIds);
  let remainingFailures = 0;
  let inFlight = 0;

  async function checkpoint(patch: Record<string, unknown> = {}) {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (
        current.data()?.leaseId !== leaseId ||
        current.data()?.status === "cancelled"
      )
        throw new Error("Discovery push lease changed.");
      tx.update(ref, {
        deliveredTokenIds: [...delivered],
        rejectedTokenIds: [...rejected],
        delivered: delivered.size,
        failed: rejected.size + remainingFailures,
        leaseUntil: Date.now() + LEASE_TIME,
        ...patch,
      });
    });
  }

  try {
    const tokens = await db.collection("pushTokens").get();
    const targets = discoveryRecipients(
      tokens.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as PushRegistration,
      ),
      state.members,
    )
      .map((target) => ({ ...target, tokenId: hash(target.token) }))
      .filter(
        (target) =>
          !delivered.has(target.tokenId) && !rejected.has(target.tokenId),
      );
    for (let index = 0; index < targets.length; index += 500) {
      const latest = (await db.doc("workshops/main").get()).data() as
        WorkshopState | undefined;
      if (!currentDiscovery(latest, job)) {
        await checkpoint({
          status: "cancelled",
          reason: "discovery-changed",
          finishedAt: Date.now(),
          leaseUntil: 0,
        });
        return;
      }
      const batch = targets
        .slice(index, index + 500)
        .filter((target) => Object.hasOwn(latest.members, target.uid));
      if (!batch.length) continue;
      inFlight = batch.length;
      const response = await sender({
        tokens: batch.map((t) => t.token),
        data: {
          type: "treasure-found",
          title: job.title,
          body: job.body,
          eventId: `discovery-${ref.id}`,
          // Older installed workers use noticeId as the notification tag.
          noticeId: `discovery-${ref.id}`,
          treasureId: job.treasureId,
        },
        webpush: { headers: { TTL: "1800", Urgency: "high" } },
      });
      inFlight = 0;
      const invalid: string[] = [];
      batch.forEach((target, i) => {
        const result = response.responses[i];
        if (result?.success) delivered.add(target.tokenId);
        else if (
          [
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
          ].includes(result?.error?.code ?? "")
        ) {
          rejected.add(target.tokenId);
          invalid.push(target.id);
        } else remainingFailures++;
      });
      await checkpoint();
      // Cleaning up an obsolete subscription must not re-send successful notifications.
      await Promise.allSettled(
        invalid.map((id) => db.doc(`pushTokens/${id}`).delete()),
      );
    }
    if (remainingFailures && job.attempts < MAX_ATTEMPTS)
      throw new Error("Some discovery pushes need a retry.");
    await checkpoint({
      status:
        rejected.size + remainingFailures
          ? delivered.size
            ? "partial"
            : "failed"
          : "sent",
      finishedAt: Date.now(),
      leaseUntil: 0,
    });
  } catch {
    remainingFailures += inFlight;
    const retry =
      job.attempts < MAX_ATTEMPTS && Date.now() - job.createdAt < MAX_AGE;
    await checkpoint({
      status: retry ? "pending" : delivered.size ? "partial" : "failed",
      reason: "delivery-error",
      leaseUntil: 0,
      ...(retry ? {} : { finishedAt: Date.now() }),
    });
    if (retry) throw new Error("Discovery push delivery will retry.");
  }
}
