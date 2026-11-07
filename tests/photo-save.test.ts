import { afterEach, describe, expect, it, vi } from "vitest";
import { canSharePhoto, preparePhotoImage } from "../src/lib/photo-save";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saving a photo as an image", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const source = () => ({
    url: "https://storage.example/photo",
    filename: "workshop_photo_2.jpg",
    release: vi.fn(),
  });

  it("hands native sharing the original JPEG bytes and an explicit image MIME type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
    const release = vi.spyOn(URL, "revokeObjectURL");
    const input = source();
    const image = await preparePhotoImage(input, new AbortController().signal);
    expect(image.file.type).toBe("image/jpeg");
    expect(image.file.name).toBe(input.filename);
    expect(new Uint8Array(await image.file.arrayBuffer())).toEqual(bytes);
    expect(image.url).toMatch(/^blob:/);
    expect(input.release).toHaveBeenCalledOnce();
    image.release();
    expect(release).toHaveBeenCalledWith(image.url);
  });

  it.each([
    new Response("denied", { status: 403 }),
    new Response("<html>error</html>"),
    new Response(new Uint8Array()),
  ])("never offers an error response as an image", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const input = source();
    await expect(
      preparePhotoImage(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(input.release).toHaveBeenCalledOnce();
  });

  it("releases the source without creating an image after the save view closes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
    const create = vi.spyOn(URL, "createObjectURL");
    const input = source();
    const controller = new AbortController();
    controller.abort();
    await expect(preparePhotoImage(input, controller.signal)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(input.release).toHaveBeenCalledOnce();
  });

  it("checks actual file-sharing support, including unsupported and denied browsers", () => {
    const file = new File([bytes], "photo.jpg", { type: "image/jpeg" });
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share: vi.fn(), canShare });
    expect(canSharePhoto(file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    canShare.mockReturnValue(false);
    expect(canSharePhoto(file)).toBe(false);
    canShare.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(canSharePhoto(file)).toBe(false);
    vi.stubGlobal("navigator", {});
    expect(canSharePhoto(file)).toBe(false);
  });
});
