import type { Member, Settings, WorkshopState } from "./types";
import type { PhotoComment, PhotoPost } from "./photos";
import { englishName } from "./names";

export type PhotoNotificationKind = "post" | "like" | "comment" | "mention";
export interface PhotoEvent {
  id: string;
  postId: string;
  generation: number;
  actorId: string;
  actorHandle: string;
  createdAt: number;
  action: "post" | "like" | "comment";
  commentId?: string;
  parentId?: string;
  recipients: Record<string, PhotoNotificationKind>;
}
const DAY = 86400000;
export function koreaDate(now: number) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}
/** Date boundaries are Korean calendar days, even when the event starts at 10am. */
export function photoDeliveryTime(settings: Settings, now: number) {
  const date = koreaDate(now);
  const realtime =
    date >= koreaDate(Date.parse(settings.startsAt)) &&
    date <= koreaDate(Date.parse(settings.endsAt));
  const morning = Date.parse(`${date}T09:00:00+09:00`);
  return {
    mode: realtime ? ("realtime" as const) : ("digest" as const),
    dueAt: realtime ? now : now < morning ? morning : morning + DAY,
  };
}
/** Match complete handles only; email addresses and partial names do not mention people. */
export function mentionedMembers(
  body: string,
  members: Record<string, Member>,
) {
  const knownHandles = new Set(
    Object.values(members).map((member) => member.handle.toLowerCase()),
  );
  const handles = new Set(
    [
      ...body.matchAll(
        /(?:^|[^\p{L}\p{N}._@-])@([a-z0-9._-]+)(?![\p{L}\p{N}_.@-])/giu,
      ),
    ].map((match) => {
      const handle = match[1].toLowerCase();
      return knownHandles.has(handle) ? handle : handle.replace(/\.+$/, "");
    }),
  );
  return Object.values(members)
    .filter((member) => handles.has(member.handle.toLowerCase()))
    .map((member) => member.id);
}
export function photoEvent(
  state: WorkshopState,
  actor: Member,
  post: PhotoPost,
  action: PhotoEvent["action"],
  now: number,
  comment?: PhotoComment,
  replyTo?: PhotoComment,
): PhotoEvent {
  const recipients: Record<string, PhotoNotificationKind> = {};
  const add = (uid: string | undefined, kind: PhotoNotificationKind) => {
    if (uid && uid !== actor.id && Object.hasOwn(state.members, uid))
      recipients[uid] = kind;
  };
  if (action === "post")
    Object.keys(state.members).forEach((uid) => add(uid, "post"));
  if (action === "like") add(comment?.authorId ?? post.authorId, "like");
  if (action === "comment") {
    add(post.authorId, "comment");
    add(replyTo?.authorId, "comment");
  }
  if (action !== "like")
    mentionedMembers(comment?.body ?? post.caption, state.members).forEach(
      (uid) => add(uid, "mention"),
    );
  return {
    id: `${post.generation}-${post.id}-${action}-${comment?.id ?? "post"}${action === "like" ? `-${actor.id}` : ""}`,
    postId: post.id,
    generation: post.generation,
    actorId: actor.id,
    actorHandle: actor.handle,
    action,
    createdAt: now,
    ...(comment
      ? {
          commentId: comment.id,
          ...(comment.parentId ? { parentId: comment.parentId } : {}),
        }
      : {}),
    recipients: state.settings.photoNotifications === false ? {} : recipients,
  };
}
export function photoNotificationText(
  events: Array<{ event: PhotoEvent; kind: PhotoNotificationKind }>,
  mode: "digest" | "realtime",
) {
  if (mode === "digest") {
    const counts = { post: 0, like: 0, comment: 0, mention: 0 };
    events.forEach(({ kind }) => counts[kind]++);
    const labels = {
      post: "새 글",
      like: "좋아요",
      comment: "댓글",
      mention: "멘션",
    };
    return {
      title: "사진첩의 아침 소식",
      body:
        (Object.keys(counts) as PhotoNotificationKind[])
          .filter((kind) => counts[kind])
          .map((kind) => `${labels[kind]} ${counts[kind]}개`)
          .join(" · ") + "가 기다리고 있어요.",
    };
  }
  const { event, kind } = events[0];
  const who = englishName(event.actorHandle);
  const body =
    kind === "post"
      ? `${who}가 사진첩에 새 글을 올렸어요.`
      : kind === "like"
        ? `${who}가 내 ${event.commentId ? "댓글" : "사진"}을 좋아해요.`
        : kind === "mention"
          ? `${who}가 ${event.commentId ? "댓글" : "사진첩"}에서 나를 멘션했어요.`
          : `${who}가 ${event.parentId ? "답글" : "댓글"}을 남겼어요.`;
  return { title: "사진첩에 새 소식이 있어요", body };
}
