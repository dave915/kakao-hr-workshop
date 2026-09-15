import { describe, expect, it } from "vitest";
import { isCameraLive } from "../src/lib/camera";
import { actionInput } from "../shared/validation";
const liveTrack = { readyState: "live" as const, enabled: true, muted: false };
const video = {
  paused: false,
  ended: false,
  readyState: 4,
  videoWidth: 720,
  videoHeight: 1280,
};
const stream = { getVideoTracks: () => [liveTrack] };

describe("camera-required treasure collection", () => {
  it("requires both an active video track and a playing visible video", () => {
    expect(isCameraLive(stream, video, true)).toBe(true);
    expect(isCameraLive(null, video, true)).toBe(false);
    expect(isCameraLive(stream, null, true)).toBe(false);
    expect(isCameraLive(stream, video, false)).toBe(false);
    expect(isCameraLive({ getVideoTracks: () => [] }, video, true)).toBe(false);
  });
  it("blocks ended, disabled, or interrupted cameras at claim time", () => {
    for (const track of [
      { ...liveTrack, readyState: "ended" as const },
      { ...liveTrack, enabled: false },
      { ...liveTrack, muted: true },
    ])
      expect(isCameraLive({ getVideoTracks: () => [track] }, video, true)).toBe(
        false,
      );
  });
  it("blocks paused playback, missing frames and zero-sized video", () => {
    for (const state of [
      { ...video, paused: true },
      { ...video, ended: true },
      { ...video, readyState: 1 },
      { ...video, videoWidth: 0 },
      { ...video, videoHeight: 0 },
    ])
      expect(isCameraLive(stream, state, true)).toBe(false);
  });
  it("accepts camera collection and rejects the old map collection action", () => {
    const input = {
      treasureId: "t1",
      position: { lat: 37.5, lng: 127, accuracy: 5, timestamp: Date.now() },
    };
    expect(actionInput.safeParse({ ...input, action: "claim" }).success).toBe(
      false,
    );
    expect(
      actionInput.safeParse({ ...input, action: "claimCamera" }).success,
    ).toBe(true);
  });
});
