export const WIDGET = {
  COLLAPSED_HEIGHT: 60,
  MAX_HEIGHT: 600,
  WIDTH: 400,
  MIN_WIDTH: 320,
} as const;

export const BLOB = {
  SIZE: 100,
  RADIUS: 35,
  BREATH_AMPLITUDE: 3.5,
  BREATH_PERIOD_MS: 3800,
  HUE_SPEED: 15,             // deg/s in idle
  NOISE_AMPLITUDE: 2.5,
  NOISE_SPEED: 0.7,
  POSITION: { right: 20, bottom: 20 },
  PALETTE: [
    { h: 220, s: 0.65, l: 0.45 },
    { h: 260, s: 0.60, l: 0.50 },
    { h: 290, s: 0.55, l: 0.55 },
    { h: 320, s: 0.50, l: 0.60 },
  ],
  EXPANDED_PALETTE: [
    { h: 190, s: 0.70, l: 0.50 },
    { h: 210, s: 0.65, l: 0.55 },
    { h: 240, s: 0.60, l: 0.50 },
  ],
  THINKING_PALETTE: [
    { h: 270, s: 0.80, l: 0.65 },
  ],
} as const;

export const TIMING = {
  AUTO_COLLAPSE_AFTER_MS: 5000,
  THINKING_GLOW_MS: 1500,
  MESSAGE_FLOAT_MS: 800,
} as const;
