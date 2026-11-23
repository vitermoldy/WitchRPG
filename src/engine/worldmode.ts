import * as THREE from 'three'
import { TIERS, UNITS, type UnitKind } from '../game/balance'
import { tierUnlocked } from '../game/progression'
import type { Game } from './game'
import type { CampSpot, Gate } from './openworld'
import { COLOR } from './palette'
import type { Unit } from './units'

interface Camp {
  spot: CampSpot
  state: 'idle' | 'active' | 'cleared'
  units: Unit[]
  respawnAt: number
  open: number
}

const WAKE = 80
const SLEEP = 170
const RESPAWN = 120
const LEASH = 45

/** Runs the open world: camps that wake and clear, the altar, gates, and keeping the army close. */
export class WorldDirector {
  private readonly g: Game
  camps: Camp[] = []
  private time = 0
  private lastHp = 0
