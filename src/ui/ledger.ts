import { RANKS, UNITS } from '../game/balance'
import { buyUpgrade, canUpgrade, derive, isUnlocked, releaseShadow, spendStat, STAT_KEYS, xpToNext, type StatKey } from '../game/progression'
import { SKILLS } from '../game/skills'

import type { Profile } from '../game/progression'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

