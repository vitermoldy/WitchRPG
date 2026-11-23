import { describe, expect, it } from 'vitest'
import {
  addShadow,
  buyUpgrade,
  derive,
  gainXp,
  impactDamage,
  newProfile,
  riteChance,
  shadowName,
  shadowSlots,
  spendStat,
  unitStats,
  xpForKill,
  xpToNext,
} from '../src/game/progression'
import { SKILLS } from '../src/game/skills'
import { SPELL } from '../src/game/balance'

const ALL = SKILLS.map((s) => s.id)

describe('XP curve from the GDD', () => {
  it('matches the two anchor values', () => {
    expect(xpToNext(1)).toBe(80)
    expect(xpToNext(9)).toBe(2160)
  })
  it('rounds to tens', () => {
