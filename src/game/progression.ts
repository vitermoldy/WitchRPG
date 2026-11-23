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

