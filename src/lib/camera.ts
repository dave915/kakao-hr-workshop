type CameraTrack = Pick<MediaStreamTrack, "readyState" | "enabled" | "muted">;
type CameraStream = { getVideoTracks: () => CameraTrack[] };
type CameraVideo = Pick<
  HTMLVideoElement,
  "paused" | "ended" | "readyState" | "videoWidth" | "videoHeight"
>;

/** Check the current media state again at the moment the user claims a treasure. */
export function isCameraLive(
  stream: CameraStream | null,
  video: CameraVideo | null,
  visible: boolean,
) {
  return Boolean(
    visible &&
    video &&
    !video.paused &&
    !video.ended &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    stream
      ?.getVideoTracks()
      .some(
        (track) => track.readyState === "live" && track.enabled && !track.muted,
      ),
  );
}
