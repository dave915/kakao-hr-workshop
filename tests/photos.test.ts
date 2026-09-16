import { describe, expect, it } from "vitest";
import {
  checkPhotoQuota,
  photoActionInput,
  photoPath,
  PHOTO_MONTHLY_LIMIT,
  PHOTO_MEMBER_MONTHLY_LIMIT,
  PHOTO_STORAGE_LIMIT,
} from "../shared/photos";
describe("photo board limits", () => {
  it("validates uploads without trusting arbitrary storage paths or more than three photos", () => {
    const base = {
      action: "begin",
      id: crypto.randomUUID(),
      caption: "  추억  ",
      photos: [{ width: 1600, height: 1200 }],
    };
    expect(photoActionInput.parse(base)).toMatchObject({ caption: "추억" });
    for (const patch of [
      { photos: [] },
      { photos: Array(4).fill({ width: 10, height: 10 }) },
      { photos: [{ width: 1601, height: 10 }] },
      { id: "../outside" },
      { caption: "x".repeat(1001) },
    ])
      expect(photoActionInput.safeParse({ ...base, ...patch }).success).toBe(
        false,
      );
  });
  it("enforces monthly, per-member and stored photo limits at the exact boundary", () => {
    expect(
      checkPhotoQuota(
        3,
        PHOTO_MONTHLY_LIMIT - 3,
        PHOTO_MEMBER_MONTHLY_LIMIT - 3,
        PHOTO_STORAGE_LIMIT - 3,
      ),
    ).toBeNull();
    expect(checkPhotoQuota(3, PHOTO_MONTHLY_LIMIT - 2, 0, 0)).toContain(
      "이번 달",
    );
    expect(checkPhotoQuota(3, 0, PHOTO_MEMBER_MONTHLY_LIMIT - 2, 0)).toContain(
      "한 사람당",
    );
    expect(checkPhotoQuota(3, 0, 0, PHOTO_STORAGE_LIMIT - 2)).toContain(
      "보관 공간",
    );
  });
  it("keeps full images, thumbnails and reset generations in separate deterministic paths", () => {
    const post = { generation: 3, authorId: "alex.k", id: "post-id" };
    expect(photoPath(post, 1, "full")).toBe(
      "photos/3/alex.k/post-id/1-full.jpg",
    );
    expect(photoPath(post, 1, "thumb")).not.toBe(photoPath(post, 1, "full"));
    expect(photoPath({ ...post, generation: 4 }, 1, "full")).not.toBe(
      photoPath(post, 1, "full"),
    );
  });
});
