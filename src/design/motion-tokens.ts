/** Runtime motion/gesture tokens. Keep solver safeguards in their algorithms. */
export const liquidTabMotionTokens = {
  follow: { stiffness: 1800, damping: 70 },
  settle: { stiffness: 620, damping: 42 },
  lift: { stiffness: 800, damping: 48 },
  railExpansion: 0.04,
  contentMagnification: 0.22,
  lensWidthExpansion: 0.16,
  lensHeightExpansion: 0.38,
  velocityStretchScale: 3200,
  maxVelocityStretch: 0.14,
  stretchCompression: 0.65,
  shapeResponse: 30,
  gesture: {
    dragThresholdPx: 6,
    verticalCancelThresholdPx: 8,
    tapTolerancePx: 12,
    releaseOutsetPx: 44,
  },
} as const;

export const photoViewerMotionTokens = {
  maxZoom: 4,
  toggleZoom: 2,
  keyboardPanStepPx: 48,
  doubleTapDelayMs: 300,
  swipeThresholdPx: 50,
  swipeDirectionRatio: 1.4,
  tapTolerancePx: 8,
} as const;
