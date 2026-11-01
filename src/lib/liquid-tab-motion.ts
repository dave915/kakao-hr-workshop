import { liquidTabMotionTokens as tokens } from "../design/motion-tokens";

export type LiquidTabMotion = {
  x: number;
  target: number;
  velocity: number;
  lift: number;
  liftVelocity: number;
  sx: number;
  sy: number;
};

export type LiquidTabBounds = {
  step: number;
  max: number;
  left: number;
  center: number;
  viewportWidth: number;
};

/** Press lifts the lens; movement briefly broadens it. Release flattens it. */
export function advanceLiquidTab(
  state: LiquidTabMotion,
  bounds: LiquidTabBounds,
  pressed: boolean,
  reduced: boolean,
  elapsed: number,
) {
  if (reduced) {
    state.x = state.target;
    state.velocity = state.lift = state.liftVelocity = 0;
    state.sx = state.sy = 1;
    return false;
  }
  const dt = Math.min(0.032, Math.max(0, elapsed));
  const steps = Math.max(1, Math.ceil(dt * 120)),
    h = dt / steps;
  const liftTarget = pressed ? 1 : 0;
  const spring = pressed ? tokens.follow : tokens.settle;
  for (let i = 0; i < steps; i++) {
    state.velocity +=
      ((state.target - state.x) * spring.stiffness -
        state.velocity * spring.damping) *
      h;
    state.x += state.velocity * h;
    state.liftVelocity +=
      ((liftTarget - state.lift) * tokens.lift.stiffness -
        state.liftVelocity * tokens.lift.damping) *
      h;
    state.lift += state.liftVelocity * h;
  }
  if (state.x < 0 || state.x > bounds.max) {
    state.x = Math.max(0, Math.min(bounds.max, state.x));
    state.velocity = 0;
  }
  if (state.lift < 0 || state.lift > 1) {
    state.lift = Math.max(0, Math.min(1, state.lift));
    state.liftVelocity = 0;
  }
  const railScale = 1 + state.lift * tokens.railExpansion;
  const center =
    bounds.center +
    (bounds.left + bounds.step / 2 + state.x - bounds.center) * railScale;
  const availableWidth =
    2 * Math.max(0, Math.min(center - 2, bounds.viewportWidth - 2 - center));
  const stretch =
    Math.min(
      Math.abs(state.velocity) / tokens.velocityStretchScale,
      tokens.maxVelocityStretch,
    ) * state.lift;
  const maxScaleX = Math.max(
    1,
    availableWidth / ((bounds.step || 1) * railScale),
  );
  const targetX = Math.max(
    1,
    Math.min(1 + tokens.lensWidthExpansion * state.lift + stretch, maxScaleX),
  );
  const targetY =
    1 +
    tokens.lensHeightExpansion * state.lift -
    stretch * tokens.stretchCompression;
  const ease = 1 - Math.exp(-tokens.shapeResponse * dt);
  state.sx = Math.min(maxScaleX, state.sx + (targetX - state.sx) * ease);
  state.sy += (targetY - state.sy) * ease;
  const moving =
    Math.abs(state.x - state.target) > 0.08 ||
    Math.abs(state.velocity) > 1 ||
    Math.abs(state.lift - liftTarget) > 0.001 ||
    Math.abs(state.liftVelocity) > 0.01 ||
    Math.abs(state.sx - targetX) > 0.001 ||
    Math.abs(state.sy - targetY) > 0.001;
  if (!moving) {
    state.x = state.target;
    state.velocity = state.liftVelocity = 0;
    state.lift = liftTarget;
    state.sx = targetX;
    state.sy = targetY;
  }
  return moving;
}
