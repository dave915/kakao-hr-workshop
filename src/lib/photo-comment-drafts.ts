import { z } from "zod";
import { COMMENT_MAX_LENGTH, type PhotoComment } from "../../shared/photos";

const storedDraft = z.object({
  body: z.string().max(COMMENT_MAX_LENGTH),
  requestId: z.string().uuid(),
  replyTo: z
    .object({
      id: z.string().uuid(),
      parentId: z.string().uuid().optional(),
      authorId: z.string(),
      authorHandle: z.string(),
      body: z.string(),
      createdAt: z.number(),
      status: z.enum(["active", "deleted", "thread"]),
    })
    .nullable(),
});

export type PhotoCommentDraft = {
  body: string;
  replyTo: PhotoComment | null;
  requestId: string;
};

/** Session-only drafts, isolated by participant, workshop reset and post. */
export class PhotoCommentDrafts {
  private memory = new Map<string, PhotoCommentDraft>();
  constructor(
    private storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">,
  ) {}

  key(memberId: string, generation: number, postId: string) {
    return `photo-comment-draft:${JSON.stringify([memberId, generation, postId])}`;
  }

  read(key: string): PhotoCommentDraft | null {
    if (this.memory.has(key)) return this.memory.get(key)!;
    try {
      const value = this.storage().getItem(key);
      const parsed = storedDraft.safeParse(value ? JSON.parse(value) : null);
      if (parsed.success) {
        this.memory.set(key, parsed.data);
        return parsed.data;
      }
    } catch {
      /* Unavailable storage must not prevent writing a comment. */
    }
    return null;
  }

  write(key: string, draft: PhotoCommentDraft) {
    const empty = !draft.body && !draft.replyTo;
    if (empty) this.memory.delete(key);
    else this.memory.set(key, draft);
    try {
      if (empty) this.storage().removeItem(key);
      else this.storage().setItem(key, JSON.stringify(draft));
    } catch {
      /* Keep the in-memory draft when session storage is unavailable. */
    }
  }
}

export const photoCommentDrafts = new PhotoCommentDrafts(() => sessionStorage);
