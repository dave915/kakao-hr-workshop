export type PhotoTransform = { scale: number; x: number; y: number };
export const PHOTO_FIT: PhotoTransform = { scale: 1, x: 0, y: 0 };

/** Keep the actual contained image within reach, including portrait/landscape. */
export function clampPhotoTransform(
  value: PhotoTransform,
  viewport: { width: number; height: number },
  photo: { width: number; height: number },
): PhotoTransform {
  const scale = Math.max(1, Math.min(4, value.scale));
  const fit = Math.min(
    viewport.width / photo.width,
    viewport.height / photo.height,
  );
  const maxX = Math.max(0, (photo.width * fit * scale - viewport.width) / 2);
  const maxY = Math.max(0, (photo.height * fit * scale - viewport.height) / 2);
  return {
    scale,
    x: maxX === 0 ? 0 : Math.max(-maxX, Math.min(maxX, value.x)),
    y: maxY === 0 ? 0 : Math.max(-maxY, Math.min(maxY, value.y)),
  };
}
