import {
  CHAOS,
  GROWTH,
  MOVE,
  PLAYER,
  RANKS,
  RITE,
  SHADOW,
  UNITS,
  XP,
  type RankId,
  type UnitKind,
} from './balance'
import { skillById, type SkillId } from './skills'

export type StatKey = 'hex' | 'spr' | 'vit' | 'agi' | 'umb'
export type Stats = Record<StatKey, number>

export const STAT_KEYS: StatKey[] = ['hex', 'spr', 'vit', 'agi', 'umb']

export interface ShadowRecord {
  id: number
  name: string
  kind: UnitKind
  rank: RankId
  level: number
  xp: number
}

export interface Settings {
  sensitivity: number
  volume: number
  headBob: boolean
  shake: boolean
}

export interface Profile {
  version: 1
  level: number
  xp: number
  statPoints: number
  skillPoints: number
  stats: Stats
  upgrades: Partial<Record<SkillId, boolean>>
  shadows: ShadowRecord[]
  nextShadowId: number
  clears: number
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, volume: 0.7, headBob: true, shake: true }

export function newProfile(): Profile {
  return {
    version: 1,
    level: 1,
    xp: 0,
    statPoints: 0,
    skillPoints: 0,
    stats: { hex: XP.startStat, spr: XP.startStat, vit: XP.startStat, agi: XP.startStat, umb: XP.startStat },
    upgrades: {},
    shadows: [],
    nextShadowId: 1,
    clears: 0,
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** XP needed to go from `level` to `level + 1`: 80 x n^1.5, rounded to tens. */
export function xpToNext(level: number): number {
  return Math.round((XP.base * level ** XP.exponent) / 10) * 10
}

export function xpForKill(enemyLevel: number, boss = false): number {
  return enemyLevel * (boss ? XP.perBossLevel : XP.perEnemyLevel)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Chance that one Umbra Rite cast succeeds. Raw UMB counts, as in the GDD example. */
export function riteChance(rank: RankId, playerLevel: number, enemyLevel: number, umb: number): number {
  const p = RANKS[rank].base + 0.02 * (playerLevel - enemyLevel) + 0.01 * umb
  return Math.round(clamp(p, RITE.minChance, RITE.maxChance) * 1000) / 1000
}

export function shadowSlots(umb: number): number {
  return RITE.baseSlots + Math.floor(Math.max(0, umb - XP.startStat) / RITE.umbPerSlot)
}

export interface Derived {
  maxHp: number
  maxMana: number
  manaRegen: number
  damageMult: number
  speedMult: number
  floatTime: number
  slots: number
}

/** Stat effects count the points above the starting 5, so a new witch plays at the GDD's base values. */
export function derive(stats: Stats): Derived {
  const above = (k: StatKey) => stats[k] - XP.startStat
  return {
    maxHp: PLAYER.baseHp + PLAYER.hpPerVit * stats.vit,
    maxMana: PLAYER.baseMana + PLAYER.manaPerSpr * stats.spr,
    manaRegen: PLAYER.manaRegen * (1 + PLAYER.manaRegenPerSpr * above('spr')),
    damageMult: 1 + PLAYER.damagePerHex * above('hex'),
    speedMult: 1 + PLAYER.speedPerAgi * above('agi'),
    floatTime: MOVE.floatMax + MOVE.floatPerAgi * above('agi'),
    slots: shadowSlots(stats.umb),
  }
}

export const isUnlocked = (p: Profile, id: SkillId) => p.level >= skillById(id).unlock
export const hasUpgrade = (p: Profile, id: SkillId) => !!p.upgrades[id] && isUnlocked(p, id)

export function canUpgrade(p: Profile, id: SkillId): boolean {
  const def = skillById(id)
  return def.built && isUnlocked(p, id) && !p.upgrades[id] && p.skillPoints > 0
