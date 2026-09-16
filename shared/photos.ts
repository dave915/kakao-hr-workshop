import { z } from "zod";

export const PHOTO_MAX_BYTES = 500 * 1024;
export const THUMB_MAX_BYTES = 50 * 1024;
export const PHOTOS_PER_POST = 3;
export const PHOTO_PAGE_SIZE = 18;
export const PHOTO_MONTHLY_LIMIT = 1000;
export const PHOTO_MEMBER_MONTHLY_LIMIT = 30;
export const PHOTO_STORAGE_LIMIT = 4000;
export const PHOTO_DRAFT_LIFETIME = 30 * 60 * 1000;
export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_PAGE_SIZE = 20;
export const COMMENT_PREVIEW_SIZE = 3;
export const COMMENTS_PER_POST = 200;
export const COMMENTS_PER_MEMBER_DAY = 100;
export const commentBody = z
  .string()
  .trim()
  .min(1, "댓글을 입력해주세요.")
  .max(COMMENT_MAX_LENGTH, "댓글은 500자까지 입력할 수 있어요.");
export const photoDimensions = z.object({
  width: z.number().int().min(1).max(1600),
  height: z.number().int().min(1).max(1600),
});
export type PhotoDimensions = z.infer<typeof photoDimensions>;
export const photoCursor = z.object({
  createdAt: z.number().int().nonnegative(),
  id: z.string().uuid(),
});
export type PhotoCursor = z.infer<typeof photoCursor>;
export const photoActionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("like"),
    id: z.string().uuid(),
    liked: z.boolean(),
  }),
  z.object({
    action: z.literal("comments"),
    id: z.string().uuid(),
    cursor: photoCursor.optional(),
  }),
  z.object({
    action: z.literal("replies"),
    id: z.string().uuid(),
    parentId: z.string().uuid(),
    cursor: photoCursor.optional(),
  }),
  z.object({
    action: z.literal("likeComment"),
    id: z.string().uuid(),
    commentId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
    liked: z.boolean(),
  }),
  z
    .object({
      action: z.literal("addComment"),
      id: z.string().uuid(),
      commentId: z.string().uuid(),
      body: commentBody,
      parentId: z.string().uuid().optional(),
      replyToId: z.string().uuid().optional(),
    })
    .refine(
      (input) =>
        (!input.replyToId || Boolean(input.parentId)) &&
        input.commentId !== input.parentId &&
        input.commentId !== input.replyToId,
      "답글 대상을 확인해주세요.",
    ),
  z.object({
    action: z.literal("deleteComment"),
    id: z.string().uuid(),
    commentId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("image"),
    id: z.string().uuid(),
    index: z.number().int().min(0).max(2),
    size: z.enum(["full", "thumb"]),
  }),
  z.object({ action: z.literal("list"), cursor: photoCursor.optional() }),
  z.object({
    action: z.literal("begin"),
    id: z.string().uuid(),
    caption: z.string().trim().max(1000),
    photos: z.array(photoDimensions).min(1).max(PHOTOS_PER_POST),
  }),
  z.object({ action: z.literal("publish"), id: z.string().uuid() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);
export type PhotoActionInput = z.infer<typeof photoActionInput>;
export interface PhotoPost {
  id: string;
  authorId: string;
  authorHandle: string;
  generation: number;
  caption: string;
  photos: PhotoDimensions[];
  createdAt: number;
  status: "draft" | "publishing" | "published" | "deleting" | "deleted";
  expiresAt: number;
  updatedAt: number;
  likeCount?: number;
  commentCount?: number;
  commentPreview?: PhotoComment[];
  /** Personalized response only; never stored in the canonical post. */
  liked?: boolean;
}
export interface PhotoComment {
  id: string;
  authorId: string;
  authorHandle: string;
  body: string;
  createdAt: number;
  status: "active" | "deleted" | "thread";
  parentId?: string;
  replyToId?: string;
  replyToHandle?: string;
  replyCount?: number;
  likeCount?: number;
  /** Personalized response only. */
  liked?: boolean;
}
export interface PhotoResponse {
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
  commentPreview?: PhotoComment[];
  parentComment?: PhotoComment;
  replies?: PhotoComment[];
  nextReplyCursor?: PhotoCursor | null;
  comments?: PhotoComment[];
  comment?: PhotoComment;
  nextCommentCursor?: PhotoCursor | null;
  url?: string;
  uploaded?: string[];
  post?: PhotoPost;
  posts?: PhotoPost[];
  nextCursor?: PhotoCursor | null;
  remaining?: number;
}
export function recentComments(comments: PhotoComment[]) {
  return comments
    .filter((comment) => comment.status === "active")
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    .slice(0, COMMENT_PREVIEW_SIZE);
}
export function photoPath(
  post: Pick<PhotoPost, "generation" | "authorId" | "id">,
  index: number,
  size: "full" | "thumb",
) {
  return `photos/${post.generation}/${post.authorId}/${post.id}/${index}-${size}.jpg`;
}
export function photoMonth(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}
export function uploadPhotoPath(
  post: Pick<PhotoPost, "generation" | "authorId" | "id">,
  index: number,
  size: "full" | "thumb",
) {
  return photoPath(post, index, size).replace(/^photos\//, "photo-uploads/");
}
export function checkPhotoQuota(
  count: number,
  monthly: number,
  personal: number,
  stored: number,
) {
  if (monthly + count > PHOTO_MONTHLY_LIMIT)
    return "이번 달 사진 업로드 한도에 도달했어요. 추진위원회에 문의해주세요.";
  if (personal + count > PHOTO_MEMBER_MONTHLY_LIMIT)
    return `사진은 한 사람당 한 달에 ${PHOTO_MEMBER_MONTHLY_LIMIT}장까지 올릴 수 있어요.`;
  if (stored + count > PHOTO_STORAGE_LIMIT)
    return "사진 보관 공간이 가득 찼어요. 추진위원회에 문의해주세요.";
  return null;
}
