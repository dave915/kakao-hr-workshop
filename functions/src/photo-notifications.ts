import { createHash, randomUUID } from "node:crypto";
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import {
  getMessaging,
  type BatchResponse,
  type MulticastMessage,
} from "firebase-admin/messaging";
import {
  discoveryRecipients,
  type PushRegistration,
} from "../../shared/discovery-push";
import {
  photoDeliveryTime,
  photoNotificationText,
  type PhotoEvent,
  type PhotoNotificationKind,
} from "../../shared/photo-notifications";
import type { PhotoComment, PhotoPost } from "../../shared/photos";
import type { WorkshopState } from "../../shared/types";

type Sender = (message: MulticastMessage) => Promise<BatchResponse>;
interface PhotoPush {
  uid: string;
  generation: number;
  mode: "digest" | "realtime";
  dueAt: number;
  nextAttemptAt?: number;
  status: "pending" | "sending" | "sent" | "partial" | "failed" | "cancelled";
  attempts: number;
  deliveredTokenIds: string[];
  rejectedTokenIds: string[];
  leaseId?: string;
  leaseUntil?: number;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const terminal = (job: PhotoPush) =>
  !["pending", "sending"].includes(job.status);
const LEASE = 150000;

/** Call before any transaction writes, then invoke the returned writer after reads. */
export async function preparePhotoEvent(tx: Transaction, event: PhotoEvent) {
  const ref = getFirestore().doc(`photoEvents/${hash(event.id)}`);
  const existing = await tx.get(ref);
  return () => {
    if (!existing.exists && Object.keys(event.recipients).length)
      tx.create(ref, event);
  };
}

/** Per-recipient markers make trigger retries safe, including retries across 9am. */
export async function queuePhotoEvent(
  ref: DocumentReference,
  now = Date.now(),
) {
  const db = getFirestore();
  const event = (await ref.get()).data() as PhotoEvent | undefined;
  if (!event) return;
  const recipients = Object.entries(event.recipients);
  for (let start = 0; start < recipients.length; start += 20) {
    await Promise.all(
      recipients.slice(start, start + 20).map(async ([uid, kind]) => {
        await db.runTransaction(async (tx) => {
          const marker = ref.collection("recipients").doc(hash(uid));
          const [seen, snapshot] = await Promise.all([
            tx.get(marker),
            tx.get(db.doc("workshops/main")),
          ]);
          if (seen.exists) return;
          const state = snapshot.data() as WorkshopState | undefined;
          if (
            !state ||
            (state.resetGeneration ?? 0) !== event.generation ||
            !Object.hasOwn(state.members, uid) ||
            state.settings.photoNotifications === false
          ) {
            tx.create(marker, { status: "cancelled" });
            return;
          }
          const timing = photoDeliveryTime(
            state.settings,
            Math.max(event.createdAt, now),
          );
          const key = hash(
            `${event.generation}:${uid}:${timing.mode === "digest" ? `digest:${timing.dueAt}` : event.id}`,
          );
          const jobRef = db.doc(`photoPushes/${key}`);
          const job = await tx.get(jobRef);
          // A digest is only assembled before its future cutoff; no writes race its send.
          if (!job.exists) {
            const data: PhotoPush = {
              uid,
              generation: event.generation,
              ...timing,
              nextAttemptAt: timing.dueAt,
              status: "pending",
              attempts: 0,
              deliveredTokenIds: [],
              rejectedTokenIds: [],
            };
            tx.create(jobRef, data);
          }
          tx.create(jobRef.collection("items").doc(ref.id), {
            event: { ...event, recipients: { [uid]: kind } },
            kind,
          });
          tx.create(marker, { pushId: key });
        });
      }),
    );
  }
}

export async function validPhotoItems(
  ref: DocumentReference,
  state: WorkshopState,
) {
  const db = getFirestore();
  const items = await ref.collection("items").get();
  const result: Array<{ event: PhotoEvent; kind: PhotoNotificationKind }> = [];
  // Recheck deletions, reset, removed authors, and withdrawn likes before delivery.
  const cache = new Map<string, Promise<FirebaseFirestore.DocumentSnapshot>>();
  const get = (path: string) => {
    if (!cache.has(path)) cache.set(path, db.doc(path).get());
    return cache.get(path)!;
  };
  for (let start = 0; start < items.size; start += 30) {
    const valid = await Promise.all(
      items.docs.slice(start, start + 30).map(async (doc) => {
        const item = doc.data() as {
          event: PhotoEvent;
          kind: PhotoNotificationKind;
        };
        const event = item.event;
        if (
          event.generation !== (state.resetGeneration ?? 0) ||
          !Object.hasOwn(state.members, event.actorId)
        )
          return null;
        const path = `photoPosts/${event.postId}`;
        const post = (await get(path)).data() as PhotoPost | undefined;
        if (
          !post ||
          post.status !== "published" ||
          post.generation !== event.generation
        )
          return null;
        const target = event.commentId
          ? `${path}/${event.parentId ? "replies" : "comments"}/${event.commentId}`
          : path;
        if (event.commentId) {
          const comment = (await get(target)).data() as
            PhotoComment | undefined;
          if (comment?.status !== "active") return null;
        }
        if (
          event.action === "like" &&
          !(await get(`${target}/likes/${event.actorId}`)).exists
        )
          return null;
        return item;
      }),
    );
    result.push(...valid.filter((item) => item !== null));
  }
  return result;
}

const send: Sender = async (message) => {
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

export async function dispatchPhotoPush(
  ref: DocumentReference,
  sender: Sender = send,
  now = Date.now(),
) {
  const db = getFirestore(),
    leaseId = randomUUID();
  const acquired = await db.runTransaction(async (tx) => {
    const [snapshot, current] = await Promise.all([
      tx.get(ref),
      tx.get(db.doc("workshops/main")),
    ]);
    if (!snapshot.exists) return null;
    const job = snapshot.data() as PhotoPush;
    if (terminal(job) || job.dueAt > now || (job.nextAttemptAt ?? 0) > now)
      return null;
    if (job.status === "sending" && (job.leaseUntil ?? 0) > now) return null;
    const state = current.data() as WorkshopState | undefined;
    if (
      !state ||
      (state.resetGeneration ?? 0) !== job.generation ||
      !Object.hasOwn(state.members, job.uid) ||
      state.settings.photoNotifications === false
    ) {
      tx.update(ref, {
        status: "cancelled",
        nextAttemptAt: FieldValue.delete(),
        finishedAt: now,
      });
      return null;
    }
    if (job.attempts >= 5 || now - job.dueAt > 48 * 3600000) {
      tx.update(ref, {
        status: job.deliveredTokenIds.length ? "partial" : "failed",
        nextAttemptAt: FieldValue.delete(),
        finishedAt: now,
      });
      return null;
    }
    const attempts = job.attempts + 1;
    tx.update(ref, {
      status: "sending",
      attempts,
      leaseId,
      leaseUntil: now + LEASE,
      nextAttemptAt: now + LEASE,
    });
    return { job: { ...job, attempts }, state };
  });
  if (!acquired) return;
  const { job, state } = acquired;
  const delivered = new Set(job.deliveredTokenIds),
    rejected = new Set(job.rejectedTokenIds);
  let failed = 0;
  async function checkpoint(patch: Record<string, unknown>) {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.leaseId !== leaseId)
        throw new Error("Photo push lease changed.");
      tx.update(ref, {
        deliveredTokenIds: [...delivered],
        rejectedTokenIds: [...rejected],
        delivered: delivered.size,
        failed: rejected.size + failed,
        ...patch,
      });
    });
  }
  try {
    const items = await validPhotoItems(ref, state);
    if (!items.length) {
      await checkpoint({
        status: "cancelled",
        nextAttemptAt: FieldValue.delete(),
        finishedAt: now,
      });
      return;
    }
    const message = photoNotificationText(items, job.mode);
    const registrations = await db
      .collection("pushTokens")
      .where("uid", "==", job.uid)
      .get();
    const targets = discoveryRecipients(
      registrations.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as PushRegistration,
      ),
      state.members,
    )
      .map((target) => ({ ...target, tokenId: hash(target.token) }))
      .filter(
        (target) =>
          !delivered.has(target.tokenId) && !rejected.has(target.tokenId),
      );
    for (let start = 0; start < targets.length; start += 500) {
      const latest = (await db.doc("workshops/main").get()).data() as
        WorkshopState | undefined;
      if (
        !latest ||
        !Object.hasOwn(latest.members, job.uid) ||
        (latest.resetGeneration ?? 0) !== job.generation ||
        latest.settings.photoNotifications === false
      ) {
        await checkpoint({
          status: "cancelled",
          nextAttemptAt: FieldValue.delete(),
          finishedAt: now,
        });
        return;
      }
      const batch = targets.slice(start, start + 500);
      const response = await sender({
        tokens: batch.map((target) => target.token),
        data: {
          type: "photo-activity",
          ...message,
          eventId: `photo-${ref.id}`,
          noticeId: `photo-${ref.id}`,
          ...(job.mode === "realtime" ? { postId: items[0].event.postId } : {}),
        },
        webpush: {
          headers: {
            TTL: "86400",
            Urgency: job.mode === "realtime" ? "high" : "normal",
          },
        },
      });
      const invalid: string[] = [];
      batch.forEach((target, index) => {
        const result = response.responses[index];
        if (result?.success) delivered.add(target.tokenId);
        else if (
          [
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
          ].includes(result?.error?.code ?? "")
        ) {
          rejected.add(target.tokenId);
          invalid.push(target.id);
        } else failed++;
      });
      await checkpoint({
        leaseUntil: Date.now() + LEASE,
        nextAttemptAt: Date.now() + LEASE,
      });
      await Promise.allSettled(
        invalid.map((id) => db.doc(`pushTokens/${id}`).delete()),
      );
    }
    if (failed && job.attempts < 5) throw new Error("Photo push needs retry.");
    await checkpoint({
      status:
        failed + rejected.size
          ? delivered.size
            ? "partial"
            : "failed"
          : "sent",
      nextAttemptAt: FieldValue.delete(),
      finishedAt: now,
    });
  } catch (error) {
    await checkpoint({
      status:
        job.attempts < 5 ? "pending" : delivered.size ? "partial" : "failed",
      nextAttemptAt: job.attempts < 5 ? now + 60000 : FieldValue.delete(),
      leaseUntil: 0,
      reason: "delivery-error",
    });
    throw error;
  }
}

/** Also recovers interrupted realtime sends after their lease expires. */
export async function sendDuePhotoPushes(
  now = Date.now(),
  sender: Sender = send,
) {
  const db = getFirestore();
  // A bounded run avoids unbounded bills; remaining jobs stay due for the next minute.
  const due = await db
    .collection("photoPushes")
    .where("nextAttemptAt", "<=", now)
    .orderBy("nextAttemptAt")
    .limit(500)
    .get();
  for (let start = 0; start < due.size; start += 20) {
    const results = await Promise.allSettled(
      due.docs
        .slice(start, start + 20)
        .map((doc) => dispatchPhotoPush(doc.ref, sender, now)),
    );
    for (const result of results)
      if (result.status === "rejected")
        console.error(
          "Photo push scheduled retry",
          result.reason instanceof Error
            ? result.reason.message
            : "delivery-error",
        );
  }
}
