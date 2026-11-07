/** Keep the original JPEG bytes and give the OS an image, not a download URL. */
export async function preparePhotoImage(
  source: { url: string; filename: string; release: () => void },
  signal: AbortSignal,
) {
  try {
    const response = await fetch(source.url, {
      signal,
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("사진을 불러오지 못했어요.");
    const blob = await response.blob();
    const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff)
      throw new Error("사진 형식을 확인하지 못했어요.");
    signal.throwIfAborted();
    const file = new File([blob], source.filename, { type: "image/jpeg" });
    const url = URL.createObjectURL(file);
    return { file, url, release: () => URL.revokeObjectURL(url) };
  } finally {
    source.release();
  }
}

export function canSharePhoto(file: File) {
  try {
    return Boolean(
      typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] }),
    );
  } catch {
    return false;
  }
}
