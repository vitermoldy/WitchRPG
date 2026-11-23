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
  private calm = 0
  private leashT = 0

  constructor(g: Game) {
    this.g = g
  }

  /** `keep` leaves cleared camps cleared (their clock keeps running); packs that were awake go back to sleep. */
  start(keep = false) {
    if (keep && this.camps.length) {
      for (const c of this.camps) {
        c.units = []
        if (c.state === 'active') c.state = 'idle'
      }
    } else {
      this.camps = this.g.ow.camps.map((spot) => ({ spot, state: 'idle', units: [], respawnAt: 0, open: 1 }))
      this.time = 0
    }
    this.lastHp = this.g.player.hp
    this.calm = 0
  }

  private wake(c: Camp) {
    const g = this.g
    c.state = 'active'
    c.units = []
    const [lo, hi] = c.spot.levels
    let i = 0
    for (const [kind, count] of Object.entries(c.spot.pack) as [Exclude<UnitKind, 'hollow'>, number][]) {
      for (let n = 0; n < count; n++, i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5
        const r = 3 + Math.random() * 4
        const at = new THREE.Vector3(c.spot.pos.x + Math.cos(a) * r, 0, c.spot.pos.z + Math.sin(a) * r)
        at.y = g.colliders.groundAt(at.x, at.z, 0.6, 2, 2.5)
        const u = g.units.spawn(kind, 'rift', lo + Math.floor(Math.random() * (hi - lo + 1)), at)
        c.units.push(u)
        const big = UNITS[kind].height / 1.8
        g.glow.emit({ pos: at.clone().setY(at.y + 1), count: Math.round(20 * big), color: COLOR.chaos, intensity: 2.2, life: 0.6, size: 0.2, speed: 3 * big, jitter: 0.4 })
      }
    }
    if (c.spot.elite) g.sfx.roar()
