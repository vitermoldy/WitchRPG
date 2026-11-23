// Every tuning number lives here. Values come from the GDD tables and are starting points for
// playtesting, not final numbers.

export const MOVE = {
  walk: 5,
  sprint: 8,
  crouch: 2.6,
  jumpHeight: 1.2,
  gravity: 22,
  groundAccel: 60,
  airAccel: 16,
  groundFriction: 12,
  radius: 0.38,
  eye: 1.62,
  crouchEye: 1.05,
  step: 0.5,
  floatMax: 5,
  floatPerAgi: 0.1,
  floatSink: 0.6,
  staminaMax: 100,
  floatDrain: 20,
  staminaRegen: 35,
  staminaRegenDelay: 0.5,
  slideTime: 1,
  slideBoost: 1.45,
  interactRange: 3,
} as const

export const CAMERA = {
  fov: 80,
  sprintFov: 90,
  near: 0.05,
  far: 400,
  sensitivity: 0.0022,
} as const

export const PLAYER = {
  baseHp: 100,
  hpPerVit: 10,
  baseMana: 100,
  manaPerSpr: 5,
