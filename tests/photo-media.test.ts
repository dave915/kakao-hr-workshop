import { describe, expect, it } from "vitest";
import {
  photoActionInput,
  photoPath,
  uploadPhotoPath,
  checkVideoQuota,
  VIDEO_MONTHLY_LIMIT,
  VIDEO_STORAGE_LIMIT,
  type PhotoMedia,
} from "../shared/photos";

describe("photo board videos", () => {
  const video = {
    kind: "video",
    width: 1080,
    height: 1920,
    duration: 90,
    contentType: "video/mp4",
  } as const;
  const begin = (photos: unknown[]) => ({
    action: "begin",
    id: crypto.randomUUID(),
    caption: "워크샵 하이라이트",
    photos,
  });
  it("accepts the portrait highlight and MOV while preserving legacy image metadata", () => {
    expect(photoActionInput.parse(begin([video]))).toMatchObject({
      photos: [video],
    });
    expect(
      photoActionInput.safeParse(
        begin([{ ...video, contentType: "video/quicktime" }]),
      ).success,
    ).toBe(true);
    expect(
      photoActionInput.parse(begin([{ width: 1200, height: 1600 }])),
    ).toMatchObject({ photos: [{ width: 1200, height: 1600 }] });
  });
  it("rejects mixed uploads, multiple videos and unsupported dimensions, durations and types", () => {
    for (const photos of [
      [video, video],
      [video, { width: 100, height: 100 }],
      [{ ...video, duration: 181 }],
      [{ ...video, duration: 0 }],
      [{ ...video, duration: Infinity }],
      [{ ...video, width: 4097 }],
      [{ ...video, contentType: "text/html" }],
      [{ width: 1601, height: 100 }],
    ])
      expect(photoActionInput.safeParse(begin(photos)).success).toBe(false);
  });
  it("keeps movie, JPEG poster, legacy photo and temporary upload objects separate", () => {
    const post = {
      id: "post",
      authorId: "owner",
      generation: 2,
      photos: [video] as PhotoMedia[],
    };
    expect(photoPath(post, 0, "full")).toBe("photos/2/owner/post/0-full.mp4");
    expect(photoPath(post, 0, "thumb")).toBe("photos/2/owner/post/0-thumb.jpg");
    expect(uploadPhotoPath(post, 0, "full")).toBe(
      "photo-uploads/2/owner/post/0-full.mp4",
    );
    expect(
      photoPath(
        { ...post, photos: [{ ...video, contentType: "video/quicktime" }] },
        0,
        "full",
      ),
    ).toMatch(/0-full.mov$/);
    expect(
      photoPath({ ...post, photos: [{ width: 100, height: 100 }] }, 0, "full"),
    ).toMatch(/0-full.jpg$/);
  });
  it("enforces shared video reservations at both quota boundaries", () => {
    expect(
      checkVideoQuota(VIDEO_MONTHLY_LIMIT - 1, VIDEO_STORAGE_LIMIT - 1),
    ).toBeNull();
    expect(checkVideoQuota(VIDEO_MONTHLY_LIMIT, 0)).toContain("이번 달");
    expect(checkVideoQuota(0, VIDEO_STORAGE_LIMIT)).toContain("보관 공간");
  });
});
