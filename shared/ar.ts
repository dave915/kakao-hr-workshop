import { bearingDegrees } from "./exploration";
import { distanceMeters } from "./game";

export interface DevicePose {
  alpha: number;
  beta: number;
  gamma: number;
  updatedAt: number;
}
export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}
export const wrapDegrees = (value: number) => ((value % 360) + 360) % 360;
export const angleDifference = (target: number, heading: number) =>
  ((target - heading + 540) % 360) - 180;
export function directionMatch(
  bearing?: number | null,
  heading?: number | null,
) {
  if (
    bearing == null ||
    heading == null ||
    !Number.isFinite(bearing) ||
    !Number.isFinite(heading)
  )
    return null;
  const difference = angleDifference(
    wrapDegrees(bearing),
    wrapDegrees(heading),
  );
  return { difference, aligned: Math.abs(difference) <= 20 };
}
const rad = (angle: number) => (angle * Math.PI) / 180;
type Vector = [number, number, number];
const dot = (a: Vector, b: Vector) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0);

/** Relative alpha alone has no north reference and must never position a GPS target. */
export function devicePose(
  reading: OrientationReading,
  now = Date.now(),
): DevicePose | null {
  const {
    beta,
    gamma,
    webkitCompassHeading: heading,
    webkitCompassAccuracy: accuracy,
  } = reading;
  if (
    beta === null ||
    gamma === null ||
    !Number.isFinite(beta) ||
    !Number.isFinite(gamma)
  )
    return null;
  if (Math.abs(beta) > 180 || Math.abs(gamma) > 90) return null;
  if (
    heading !== undefined &&
    Number.isFinite(heading) &&
    heading >= 0 &&
    heading < 360
  ) {
    if (
      accuracy !== undefined &&
      (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 30)
    )
      return null;
    return { alpha: wrapDegrees(360 - heading), beta, gamma, updatedAt: now };
  }
  if (
    !reading.absolute ||
    reading.alpha === null ||
    !Number.isFinite(reading.alpha)
  )
    return null;
  return { alpha: wrapDegrees(reading.alpha), beta, gamma, updatedAt: now };
}

/** W3C Z-X'-Y'' device rotation; rear camera looks along device -Z. */
export function cameraBasis(pose: DevicePose, screenAngle = 0) {
  const a = rad(pose.alpha),
    b = rad(pose.beta),
    g = rad(pose.gamma),
    s = rad(screenAngle);
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cg = Math.cos(g),
    sg = Math.sin(g);
  const x: Vector = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg];
  const y: Vector = [-sa * cb, ca * cb, sb];
  const forward: Vector = [
    -ca * sg - sa * sb * cg,
    -sa * sg + ca * sb * cg,
    -cb * cg,
  ];
  const right = x.map((v, i) => v * Math.cos(s) - y[i] * Math.sin(s)) as Vector;
  const up = x.map((v, i) => v * Math.sin(s) + y[i] * Math.cos(s)) as Vector;
  return {
    right,
    up,
    forward,
    heading: wrapDegrees((Math.atan2(forward[0], forward[1]) * 180) / Math.PI),
  };
}

/** Use the top of a flat map screen; when upright, use the rear-facing direction. */
export function mapHeading(pose: DevicePose, screenAngle = 0) {
  const { up, forward } = cameraBasis(pose, screenAngle);
  const direction = Math.abs(up[2]) < Math.SQRT1_2 ? up : forward;
  return wrapDegrees((Math.atan2(direction[0], direction[1]) * 180) / Math.PI);
}
export function compassDirection(heading: number) {
  return [
    "북쪽",
    "북동쪽",
    "동쪽",
    "남동쪽",
    "남쪽",
    "남서쪽",
    "서쪽",
    "북서쪽",
  ][Math.round(wrapDegrees(heading) / 45) % 8];
}

/** Project an ENU ground point through the rear camera, accounting for cover cropping. */
export function projectArTarget(
  position: { lat: number; lng: number },
  target: { lat: number; lng: number },
  pose: DevicePose,
  viewport: {
    width: number;
    height: number;
    videoWidth: number;
    videoHeight: number;
    screenAngle: number;
  },
) {
  const { width, height, videoWidth, videoHeight, screenAngle } = viewport;
  if (
    [width, height, videoWidth, videoHeight].some(
      (v) => !Number.isFinite(v) || v <= 0,
    )
  )
    return null;
  const distance = distanceMeters(position, target);
  const bearing = bearingDegrees(position, target);
  // A ground-level marker with an estimated eye height. No surface/altitude detection.
  const world: Vector = [
    Math.sin(rad(bearing)) * distance,
    Math.cos(rad(bearing)) * distance,
    -1.3,
  ];
  const basis = cameraBasis(pose, screenAngle);
  const depth = dot(world, basis.forward);
  // Browser camera APIs do not expose calibrated intrinsics. Approximate 70° on the long edge.
  const cover = Math.max(width / videoWidth, height / videoHeight);
  const focal =
    (Math.max(videoWidth, videoHeight) / (2 * Math.tan(rad(35)))) * cover;
  const x =
    width / 2 + (dot(world, basis.right) * focal) / Math.max(depth, 0.01);
  const y = height / 2 - (dot(world, basis.up) * focal) / Math.max(depth, 0.01);
  const turn = angleDifference(bearing, basis.heading);
  const visible =
    depth > 0.1 && x >= 28 && x <= width - 28 && y >= 40 && y <= height - 40;
  const cue: "left" | "right" | "up" | "down" =
    depth <= 0.1 || x < 28 || x > width - 28
      ? turn < 0
        ? "left"
        : "right"
      : y < 40
        ? "up"
        : "down";
  return {
    x,
    y,
    distance,
    bearing,
    turn,
    visible,
    cue,
    size: Math.min(170, Math.max(64, (focal * 1.4) / Math.max(depth, 1))),
  };
}
