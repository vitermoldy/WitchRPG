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
