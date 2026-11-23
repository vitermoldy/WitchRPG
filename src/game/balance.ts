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
  /** The Ledger steadies her Chaos as she grows: +5% damage and +8 HP per level. */
  damagePerLevel: 0.05,
  hpPerLevel: 8,
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
  bolt: { damage: 12, mana: 0, cooldown: 0.4, speed: 48, life: 1.6, radius: 0.28, spreadDamage: 6, spreadAngle: 0.07 },
  grip: { manaPerSec: 4, maxMass: 500, range: 26, holdDistance: 6.5, throwSpeed: 30, heavyThrowSpeed: 18, aimCone: 0.07, flight: 0.9, flightGravity: 0.12 },
  impact: { coefficient: 0.14, exponent: 0.6, minSpeed: 6 },
  burst: { damage: 40, mana: 30, cooldown: 8, radius: 8, radiusUpgrade: 2, range: 24, push: 14, lift: 6 },
  snare: { mana: 25, cooldown: 12, radius: 6, duration: 6, durationUpgrade: 2, slow: 0.4, vulnerability: 0.25, range: 24 },
  barrier: { mana: 20, cooldown: 15, duration: 3, absorb: 150, absorbUpgrade: 50, blastRadius: 6, blastDamage: 25, push: 12 },
  warp: { mana: 60, cooldown: 30, radius: 10, duration: 5, durationUpgrade: 2, range: 26, liftHeight: 3.6, reflectDamage: 1.6 },
} as const

export const RITE = {
  window: 20,
  range: 10,
  castTime: 1.5,
  castTimeUpgraded: 1,
  mana: 40,
  baseSlots: 3,
  umbPerSlot: 5,
  shadowXpShare: 0.3,
  minChance: 0.1,
  maxChance: 0.9,
  swapCooldown: 10,
  swapCooldownUpgraded: 6,
  focusBonus: 0.2,
  plainCorpseTime: 6,
} as const

export const XP = {
  base: 80,
  exponent: 1.5,
  perEnemyLevel: 10,
  perBossLevel: 15,
  statPointsPerLevel: 3,
  skillPointsPerLevel: 1,
  startStat: 5,
  maxLevel: 30,
} as const

export type RankId = 'prajurit' | 'ksatria' | 'jenderal' | 'marsekal'

export const RANKS: Record<RankId, { label: string; base: number }> = {
  prajurit: { label: 'Prajurit', base: 0.6 },
  ksatria: { label: 'Ksatria', base: 0.45 },
  jenderal: { label: 'Jenderal', base: 0.3 },
  marsekal: { label: 'Marsekal', base: 0.15 },
}

export type UnitKind = 'husk' | 'hound' | 'spitter' | 'warden' | 'riftlord' | 'hollow'

export interface UnitSpec {
  name: string
  rank: RankId
  hp: number
  damage: number
  speed: number
  radius: number
  height: number
  mass: number
  attackRange: number
  windup: number
  recover: number
  cooldown: number
  lungeSpeed?: number
  lungeTime?: number
  /** Fires globs instead of hitting in melee. */
  shot?: { speed: number; gravity: number; radius: number; keepAway: number }
  /** Share of damage a raised shield stops when hit from the front. */
  shield?: number
  /** Ground slam: everything of the other side inside this radius is hit. */
  slam?: number
  /** Calls husks out of the Rift every few seconds. */
  summon?: { every: number; count: number; max: number }
  /** Too big to be lifted or flipped by Reality Warp. */
  anchored?: boolean
}

export const UNITS: Record<UnitKind, UnitSpec> = {
  husk: {
    name: 'Husk',
    rank: 'prajurit',
    hp: 40,
    damage: 10,
    speed: 3.1,
    radius: 0.45,
    height: 1.8,
    mass: 70,
    attackRange: 1.7,
    windup: 0.55,
    recover: 0.8,
    cooldown: 1.3,
  },
  hound: {
    name: 'Rift Hound',
    rank: 'prajurit',
    hp: 26,
    damage: 12,
    speed: 6.4,
    radius: 0.5,
    height: 1.1,
    mass: 45,
    attackRange: 7.5,
    windup: 0.45,
    recover: 0.9,
    cooldown: 1.8,
    lungeSpeed: 15,
    lungeTime: 0.45,
  },
  spitter: {
    name: 'Spitter',
    rank: 'prajurit',
    hp: 30,
    damage: 11,
    speed: 2.6,
    radius: 0.45,
    height: 1.5,
    mass: 55,
    attackRange: 26,
    windup: 0.6,
    recover: 0.5,
    cooldown: 2.4,
    shot: { speed: 17, gravity: 9, radius: 0.3, keepAway: 11 },
  },
  warden: {
    name: 'Warden',
    rank: 'ksatria',
    hp: 110,
    damage: 18,
    speed: 2.3,
    radius: 0.62,
    height: 2.25,
    mass: 260,
    attackRange: 2.3,
    windup: 0.8,
    recover: 1,
    cooldown: 2,
    shield: 0.85,
  },
  riftlord: {
    name: 'Rift Lord',
    rank: 'jenderal',
    hp: 260,
    damage: 22,
    speed: 2.5,
    radius: 0.95,
    height: 3.2,
    mass: 900,
    attackRange: 4.2,
    windup: 1.1,
    recover: 1.1,
    cooldown: 3.2,
    slam: 5,
    summon: { every: 14, count: 3, max: 6 },
    anchored: true,
  },
  hollow: {
    name: 'The Hollow Warden',
    rank: 'marsekal',
    hp: 2400,
    damage: 22,
    speed: 2.8,
    radius: 1.35,
    height: 4.6,
    mass: 3000,
    attackRange: 4.8,
    // A long windup and a circle that fits on a pillar: the slam is there to be stepped out of.
    windup: 1.3,
    recover: 1,
    cooldown: 2.6,
    slam: 5,
    summon: { every: 15, count: 6, max: 10 },
    anchored: true,
  },
}

/** Enemy growth per level. Kept below the witch's own growth so higher tiers stay fair. */
export const GROWTH = { hpPerLevel: 0.15, damagePerLevel: 0.1 } as const

export const SHADOW = { hpMult: 2.2, damageMult: 1.2, speedMult: 1.15, followDistance: 3.2, engageRange: 14, leash: 22, regen: 0.04 } as const

/** What raised shadows of the bigger ranks can do on their own. */
export const SHADOW_SKILL = {
  /** Rift Lord (Jenderal): calls two short-lived shadow husks. */
  call: { every: 20, count: 2, lasts: 15 },
  /** Hollow Warden (Marsekal): drags enemies in and stuns them. */
  pull: { every: 12, radius: 11, stun: 1.5 },
} as const

export type WaveSpec = Partial<Record<Exclude<UnitKind, 'hollow'>, number>> & { levels: [number, number] }

export type TierId = 1 | 2 | 3

export interface TierSpec {
  tier: TierId
  name: string
  roman: string
  unlock: number
  waves: WaveSpec[]
  maxAlive: number
  /** Tier III ends in the Hollow Warden's lair. */
  boss?: { level: number; unlock: number }
}

export const TIERS: Record<TierId, TierSpec> = {
  1: {
    tier: 1,
    name: 'Rift Tier I',
    roman: 'I',
    unlock: 1,
    maxAlive: 16,
    waves: [
  spawnInterval: 0.8,
  breather: 6,
  /** Share of max HP restored when a wave ends; the GDD has no other healing yet. */
  breatherHeal: 0.2,
} as const

export const WORLD = { maxPhysicsProps: 20, arenaHalf: 38 } as const
