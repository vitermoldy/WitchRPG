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
  manaRegen: 7,
  manaRegenPerSpr: 0.04,
  damagePerHex: 0.02,
  speedPerAgi: 0.01,
  hurtInvuln: 0.25,
} as const

export const CHAOS = {
  max: 100,
  perDamageDealt: 0.05,
  perDamageTaken: 0.45,
  overloadTime: 12,
  overloadDamage: 1.5,
  backlashTime: 3,
  backlashHpLoss: 0.1,
} as const

export const SPELL = {
  bolt: { damage: 12, mana: 0, cooldown: 0.4, speed: 48, life: 1.6, radius: 0.28, spreadDamage: 9, spreadAngle: 0.07 },
  grip: { manaPerSec: 4, maxMass: 500, range: 26, holdDistance: 6.5, throwSpeed: 30, heavyThrowSpeed: 18, aimCone: 0.07 },
  impact: { coefficient: 0.14, exponent: 0.6, minSpeed: 6 },
  burst: { damage: 40, mana: 30, cooldown: 8, radius: 8, radiusUpgrade: 2, range: 24, push: 14, lift: 6 },
  snare: { mana: 25, cooldown: 12, radius: 6, duration: 6, durationUpgrade: 2, slow: 0.4, vulnerability: 0.25, range: 24 },
  barrier: { mana: 20, cooldown: 15, duration: 3, absorb: 150, absorbUpgrade: 50, blastRadius: 6, blastDamage: 25, push: 12 },
} as const

export const RITE = {
  window: 20,
  range: 10,
  castTime: 1.5,
  castTimeUpgraded: 1,
  mana: 40,
  baseSlots: 3,
