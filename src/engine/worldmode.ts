import * as THREE from 'three'
import { TIERS, UNITS, type UnitKind } from '../game/balance'
import { tierLock, tierUnlocked } from '../game/progression'
import type { Game } from './game'
import type { CampSpot, Gate } from './openworld'
import { COLOR } from './palette'
import type { Unit } from './units'
import { pickTrait } from './rift'

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
    // Corner camps: some of the pack wake up elite.
    const plain = c.units.filter((u) => u.kind !== 'riftlord')
    for (let n = 0; n < c.spot.elites && plain.length; n++) plain.splice(Math.floor(Math.random() * plain.length), 1)[0].makeElite(pickTrait())
    if (c.spot.elite || c.spot.elites) g.sfx.roar()
  }

  update(dt: number) {
    const g = this.g
    const p = g.player
    this.time += dt
    for (const c of this.camps) {
      const d = Math.hypot(p.pos.x - c.spot.pos.x, p.pos.z - c.spot.pos.z)
      const want = c.state === 'cleared' ? 0.12 : 1
      c.open += (want - c.open) * Math.min(1, dt * 1.5)
      c.spot.mat.uniforms.uOpen.value = c.open
      if (c.state === 'idle' && d < WAKE && p.alive) this.wake(c)
      else if (c.state === 'active') {
        const alive = c.units.filter((u) => u.alive)
        if (!alive.length) {
          c.state = 'cleared'
          c.respawnAt = this.time + RESPAWN
          g.hud.message(`Kamp Lv ${c.spot.levels[0]} sampai ${c.spot.levels[1]} ditaklukkan. Retakannya meredup.`, 'info')
          g.sfx.levelUp()
        } else if (d > SLEEP && alive.every((u) => u.pos.distanceTo(p.pos) > SLEEP - 40)) {
          // Left behind: the pack goes back into its tear until she returns.
          for (const u of alive) g.units.remove(u)
          c.units = []
          c.state = 'idle'
        }
      } else if (c.state === 'cleared' && this.time > c.respawnAt && d > WAKE + 20) {
        c.state = 'idle'
      }
    }

    // The altar heals quickly; away from it, HP comes back slowly once the fighting stops.
    if (p.hp < this.lastHp - 0.01) this.calm = 0
    else this.calm += dt
    const atAltar = Math.hypot(p.pos.x - g.ow.altar.x, p.pos.z - g.ow.altar.z) < 10
    if (p.alive) {
      if (atAltar) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.12 * dt)
        p.mana = Math.min(p.maxMana, p.mana + p.maxMana * 0.12 * dt)
        if (Math.random() < dt * 10) g.glow.emit({ pos: { x: p.pos.x + (Math.random() - 0.5) * 2, y: p.pos.y + 0.2, z: p.pos.z + (Math.random() - 0.5) * 2 }, count: 1, color: COLOR.umbra, intensity: 2, life: 1, size: 0.1, vel: { x: 0, y: 1.5, z: 0 } })
      } else if (this.calm > 6) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.03 * dt)
    }
    this.lastHp = p.hp

    // Shadows left far behind (she flew off) are pulled back to her side.
    this.leashT -= dt
    if (this.leashT <= 0) {
      this.leashT = 1
      for (const u of g.umbra.field()) {
        if (u.state === 'rising' || u.pos.distanceTo(p.pos) < LEASH) continue
        if (u.command === 'hold') continue
        g.pools.open(u.pos, 1 + u.radius * 1.5, 0.4)
        g.recall(u)
        g.pools.open(u.pos, 1 + u.radius * 1.5, 1.2)
      }
    }
  }

  nearGate(): Gate | null {
    const p = this.g.player.pos
    return this.g.ow.gates.find((gt) => Math.hypot(gt.pos.x - p.x, gt.pos.z - p.z) < 6 + gt.tier && p.y < 6) ?? null
  }

  /** Text for the gate prompt: enter, or why not yet. */
  gatePrompt(gt: Gate): { ok: boolean; text: string } {
    const t = TIERS[gt.tier]
    if (tierUnlocked(this.g.profile, gt.tier)) return { ok: true, text: `Masuk ${t.name}` }
    const why = tierLock(this.g.profile, gt.tier) ?? ''
    return { ok: false, text: why.startsWith('Lv') ? `${t.name} terbuka di ${why}` : `${t.name} terkunci: ${why.charAt(0).toLowerCase()}${why.slice(1)}` }
  }

  nearAltar() {
    const p = this.g.player.pos
    return Math.hypot(p.x - this.g.ow.altar.x, p.z - this.g.ow.altar.z) < 10
  }

  /** The closest camp still to clear, for the status line. */
  nearestCamp(): { camp: Camp; dist: number } | null {
    const p = this.g.player.pos
    let best: { camp: Camp; dist: number } | null = null
    for (const c of this.camps) {
      if (c.state === 'cleared') continue
      const d = Math.hypot(p.x - c.spot.pos.x, p.z - c.spot.pos.z)
      if (!best || d < best.dist) best = { camp: c, dist: d }
    }
    return best
  }

  get cleared() {
    return this.camps.filter((c) => c.state === 'cleared').length
  }
}
