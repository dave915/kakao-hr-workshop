import { PHOTO_MAX_BYTES, THUMB_MAX_BYTES } from "../../shared/photos";
export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  name: string;
}
function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("사진을 변환하지 못했어요.")),
      "image/jpeg",
      quality,
    ),
  );
}
async function encode(
  source: CanvasImageSource,
  width: number,
  height: number,
  edge: number,
  maxBytes: number,
) {
  const canvas = document.createElement("canvas");
  let scale = Math.min(1, edge / Math.max(width, height));
  for (let resize = 0; resize < 4; resize++) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이 브라우저에서 사진을 처리할 수 없어요.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.58, 0.42]) {
      const blob = await jpeg(canvas, quality);
      if (blob.size <= maxBytes)
        return { blob, width: canvas.width, height: canvas.height };
    }
    scale *= 0.75;
  }
  throw new Error("사진 용량을 줄이지 못했어요. 다른 사진을 선택해주세요.");
}
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error(
      "사진 파일을 선택해주세요. JPG, PNG, WebP를 사용할 수 있어요.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error("원본 사진은 20MB 이하로 선택해주세요.");
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("사진을 읽을 수 없어요.");
    const full = await encode(
      image,
      image.naturalWidth,
      image.naturalHeight,
      1600,
      PHOTO_MAX_BYTES,
    );
    const thumb = await encode(
      image,
      image.naturalWidth,
      image.naturalHeight,
      360,
      THUMB_MAX_BYTES,
    );
    return {
      full: full.blob,
      thumb: thumb.blob,
      width: full.width,
      height: full.height,
      name: file.name,
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes("사진")) throw e;
    throw new Error(
      "이 사진 형식을 읽지 못했어요. JPG 또는 PNG로 저장해서 다시 선택해주세요.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
