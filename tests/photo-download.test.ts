import { describe, it, expect } from "vitest";
import {
  photoActionInput,
  photoDownloadFilename,
  type PhotoPost,
} from "../shared/photos";

const post: PhotoPost = {
  id: "12345678-1234-4234-9234-123456789012",
  authorId: "owner",
  authorHandle: "alex.k",
  createdAt: Date.parse("2026-11-06T15:30:00Z"),
  updatedAt: 0,
  expiresAt: 0,
  generation: 0,
  status: "published",
  caption: "",
  photos: [
    { width: 1200, height: 1600 },
    { width: 1600, height: 1200 },
  ],
};

describe("photo board downloads", () => {
  it("accepts only bounded media slots and discards caller-supplied paths and filenames", () => {
    expect(
      photoActionInput.parse({
        action: "download",
        id: post.id,
        index: 1,
        path: "../other",
        filename: "evil.html",
      }),
    ).toEqual({ action: "download", id: post.id, index: 1 });
    for (const index of [-1, 3, 0.5, "1"])
      expect(
        photoActionInput.safeParse({ action: "download", id: post.id, index })
          .success,
      ).toBe(false);
    expect(
      photoActionInput.safeParse({
        action: "download",
        id: "../another",
        index: 0,
      }).success,
    ).toBe(false);
  });
  it("names the selected full-quality photo with the Korean date and a distinct slot", () => {
    expect(photoDownloadFilename(post, 1)).toBe(
      `workshop_20261107_alex.k_${post.id}_2.jpg`,
    );
    expect(photoDownloadFilename(post, 0)).not.toBe(
      photoDownloadFilename(post, 1),
    );
    expect(() => photoDownloadFilename(post, 2)).toThrow();
  });
  it("preserves video container extensions rather than downloading their JPEG posters", () => {
    const media = {
      kind: "video",
      width: 1080,
      height: 1920,
      duration: 90,
      contentType: "video/mp4",
    } as const;
    expect(photoDownloadFilename({ ...post, photos: [media] }, 0)).toMatch(
      /_1\.mp4$/,
    );
    expect(
      photoDownloadFilename(
        { ...post, photos: [{ ...media, contentType: "video/quicktime" }] },
        0,
      ),
    ).toMatch(/_1\.mov$/);
  });
  it("keeps untrusted display names out of header and path syntax", () => {
    const filename = photoDownloadFilename(
      { ...post, authorHandle: '../"\r\nX-Header: yes/한국' },
      0,
    );
    expect(filename).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(filename).not.toMatch(/[\r\n"/\\:]/);
  });
});
