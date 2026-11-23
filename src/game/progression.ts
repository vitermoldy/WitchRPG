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
