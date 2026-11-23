import * as THREE from 'three'
import { SHADOW, SPELL, UNITS, type UnitKind, type UnitSpec } from '../game/balance'
import { impactDamage, unitStats, type ShadowRecord } from '../game/progression'
import type { Colliders } from './collide'
import { buildModel, disposeModel, type Team, type UnitModel } from './models'
import type { Particles } from './fx'
import { COLOR } from './palette'

export type UnitState = 'spawn' | 'rising' | 'move' | 'windup' | 'strike' | 'lunge' | 'recover' | 'held' | 'air' | 'dead'
export type Command = 'follow' | 'attack' | 'hold'
export type DamageSource = 'player' | 'shadow' | 'impact' | 'rift'

export interface Target {
  pos: THREE.Vector3
  radius: number
  alive: boolean
  team: Team
}

export interface UnitHost {
  colliders: Colliders
  player: Target & { yaw: number }
  glow: Particles
  smoke: Particles
  propBlockers: { pos: THREE.Vector3; radius: number; top: number }[]
  /** Damage from a unit to the witch. */
  hurtPlayer(dmg: number, from: THREE.Vector3): void
  /** Any damage to a unit goes through the host so XP, chaos and death stay in one place. */
  hurtUnit(u: Unit, dmg: number, from: THREE.Vector3, by: DamageSource): void
  impactFx(at: THREE.Vector3, strength: number): void
  growl(): void
}

let nextId = 1

export class Unit implements Target {
  readonly id = nextId++
  readonly kind: UnitKind
  readonly team: Team
  readonly spec: UnitSpec
  level: number
  hp: number
  maxHp: number
  damage: number
  speed: number
  readonly radius: number
  readonly mass: number
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  readonly lastGood = new THREE.Vector3()
  yaw = 0
  state: UnitState = 'move'
  t = 0
  cd = 0
  target: Target | null = null
  retarget = 0
  readonly model: UnitModel
  flash = 0
  slow = 1
  vulnerable = 0
  thrown = false
  hitThisLunge = false
  lungeDir = new THREE.Vector3()
  walk = Math.random() * 6
  flank = Math.random() < 0.5 ? -1 : 1
  barShown = 0
  // Corpse.
  deadT = 0
  riteTried = false
  ash = false
  // Shadows.
  record: ShadowRecord | null = null
  command: Command = 'follow'
  holdPos = new THREE.Vector3()
  slot = 0
  focus: Unit | null = null
  focusBonus = 0

  constructor(kind: UnitKind, team: Team, level: number) {
    this.kind = kind
    this.team = team
    this.spec = UNITS[kind]
    this.level = level
    const st = unitStats(kind, level, team === 'shadow')
    this.hp = this.maxHp = st.hp
    this.damage = st.damage
    this.speed = st.speed
    this.radius = this.spec.radius
    this.mass = this.spec.mass
    this.model = buildModel(kind, team)
  }

  get alive() {
    return this.state !== 'dead'
  }

  get height() {
    return this.spec.height
  }

  get center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.spec.height * 0.55, this.pos.z)
  }

  setState(s: UnitState, t = 0) {
    this.state = s
    this.t = t
  }
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

export class UnitSystem {
  readonly units: Unit[] = []
  readonly group = new THREE.Group()
  private readonly host: UnitHost

  constructor(host: UnitHost) {
    this.host = host
  }

  spawn(kind: UnitKind, team: Team, level: number, at: THREE.Vector3, rising = false): Unit {
    const u = new Unit(kind, team, level)
    u.pos.copy(at)
    u.lastGood.copy(at)
    u.yaw = Math.atan2(-(this.host.player.pos.x - at.x), -(this.host.player.pos.z - at.z))
    u.setState(rising ? 'rising' : 'spawn')
    u.model.root.position.copy(u.pos)
    this.group.add(u.model.root)
    this.units.push(u)
    return u
  }

  remove(u: Unit) {
    const i = this.units.indexOf(u)
    if (i >= 0) this.units.splice(i, 1)
    this.group.remove(u.model.root)
    disposeModel(u.model)
  }

  clear() {
    for (const u of [...this.units]) this.remove(u)
  }

  enemies() {
    return this.units.filter((u) => u.team === 'rift' && u.alive)
  }

  shadows() {
    return this.units.filter((u) => u.team === 'shadow' && u.alive)
  }

  knock(u: Unit, impulse: THREE.Vector3) {
    if (!u.alive || u.state === 'held') return
    const scale = 70 / u.mass
    u.vel.addScaledVector(impulse, Math.min(1.6, scale))
    if (impulse.y > 0.5) {
      u.vel.y = Math.max(u.vel.y, impulse.y * Math.min(1.4, scale))
      u.pos.y = Math.max(u.pos.y, 0.05)
      u.setState('air')
    } else if (u.state !== 'air') {
      u.setState('recover', 0)
    }
  }

  private pickTarget(u: Unit): Target | null {
    const p = this.host.player
    let best: Target | null = null
    let bestD = Infinity
    if (u.team === 'rift') {
      if (p.alive) {
        best = p
        bestD = u.pos.distanceTo(p.pos) * 0.8
      }
      for (const o of this.units) {
        if (o.team !== 'shadow' || !o.alive || o.state === 'rising') continue
        const d = u.pos.distanceTo(o.pos)
        if (d < bestD) {
          best = o
          bestD = d
        }
      }
      return best
    }
    // Shadow: a focused order first, then the closest enemy inside the leash.
    if (u.command === 'attack') {
      if (u.focus && u.focus.alive) return u.focus
      // The marked enemy is down: go back to guarding the witch.
      u.command = 'follow'
      u.focus = null
    }
    const anchor = u.command === 'hold' ? u.holdPos : p.pos
    const range = u.command === 'hold' ? 6 : SHADOW.engageRange
    for (const o of this.units) {
      if (o.team !== 'rift' || !o.alive || o.state === 'spawn') continue
      const d = u.pos.distanceTo(o.pos)
      if (d < bestD && o.pos.distanceTo(anchor) < (u.command === 'hold' ? range : SHADOW.leash) && d < range + 6) {
        best = o
        bestD = d
      }
    }
    return best
  }

  private steer(u: Unit, goal: THREE.Vector3, speed: number, dt: number, stopAt = 0) {
    tmp.set(goal.x - u.pos.x, 0, goal.z - u.pos.z)
    const d = tmp.length()
    const want = d > stopAt ? speed : 0
    if (d > 1e-4) tmp.divideScalar(d)
    const ax = tmp.x * want - u.vel.x
    const az = tmp.z * want - u.vel.z
    const k = Math.min(1, dt * 8)
    u.vel.x += ax * k
    u.vel.z += az * k
    if (d > 0.3) this.face(u, goal, dt)
  }

  private face(u: Unit, at: THREE.Vector3, dt: number, rate = 8) {
    const yaw = Math.atan2(-(at.x - u.pos.x), -(at.z - u.pos.z))
    let diff = yaw - u.yaw
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    u.yaw += diff * Math.min(1, dt * rate)
  }

  private brain(u: Unit, dt: number) {
    u.retarget -= dt
    if (u.retarget <= 0 || !u.target || !u.target.alive) {
      u.target = this.pickTarget(u)
      u.retarget = 0.4 + Math.random() * 0.3
    }
    const spec = u.spec
    const speed = u.speed * u.slow
    const tgt = u.target
    if (u.state === 'move') {
      if (!tgt) {
        if (u.team === 'shadow') {
          // Out of the fight, shadows knit back together.
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * SHADOW.regen * dt)
          if (u.command === 'hold') this.steer(u, u.holdPos, speed, dt, 0.6)
          else {
            const p = this.host.player
            const n = Math.max(1, this.units.filter((o) => o.team === 'shadow').length)
            const a = p.yaw + Math.PI + (u.slot - (n - 1) / 2) * 0.7
            tmp2.set(p.pos.x - Math.sin(a) * SHADOW.followDistance, 0, p.pos.z - Math.cos(a) * SHADOW.followDistance)
            const far = u.pos.distanceTo(p.pos) > 9
            this.steer(u, tmp2, far ? speed * 1.6 : speed, dt, 0.8)
          }
        } else this.steer(u, u.pos, 0, dt)
        return
      }
      const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z) - tgt.radius
      if (u.kind === 'hound') {
        if (d < spec.attackRange && u.cd <= 0 && this.host.colliders.clear(u.center, tmp.set(tgt.pos.x, 0.8, tgt.pos.z))) {
          u.setState('windup')
          this.host.growl()
          return
        }
        // Circle in from the side instead of running straight at the target.
        tmp2.set(tgt.pos.x - u.pos.x, 0, tgt.pos.z - u.pos.z).normalize()
        const side = new THREE.Vector3(-tmp2.z, 0, tmp2.x).multiplyScalar(u.flank * Math.min(5, d * 0.5))
        const goal = new THREE.Vector3(tgt.pos.x, 0, tgt.pos.z).add(side)
        this.steer(u, goal, speed, dt, 0)
      } else {
        if (d < spec.attackRange - 0.2 && u.cd <= 0) {
          u.setState('windup')
          if (Math.random() < 0.35) this.host.growl()
          return
        }
        this.steer(u, tgt.pos, speed, dt, spec.attackRange - 0.4)
      }
      return
    }
    if (u.state === 'windup') {
      u.vel.x *= Math.exp(-10 * dt)
      u.vel.z *= Math.exp(-10 * dt)
      if (tgt) this.face(u, tgt.pos, dt, 12)
      if (u.t >= spec.windup / Math.max(0.4, u.slow)) {
        if (u.kind === 'hound' && tgt) {
          u.lungeDir.set(tgt.pos.x - u.pos.x, 0, tgt.pos.z - u.pos.z).normalize()
          u.hitThisLunge = false
          u.setState('lunge')
        } else {
          u.setState('strike')
          if (tgt && tgt.alive) {
            const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z) - tgt.radius
            tmp.set(-Math.sin(u.yaw), 0, -Math.cos(u.yaw))
            tmp2.set(tgt.pos.x - u.pos.x, 0, tgt.pos.z - u.pos.z).normalize()
            if (d < spec.attackRange + 0.45 && tmp.dot(tmp2) > 0.3) this.hit(u, tgt)
          }
        }
      }
      return
    }
    if (u.state === 'lunge') {
      const ls = (spec.lungeSpeed ?? 12) * u.slow
      u.vel.x = u.lungeDir.x * ls
      u.vel.z = u.lungeDir.z * ls
      if (tgt && tgt.alive && !u.hitThisLunge) {
        const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z)
        if (d < u.radius + tgt.radius + 0.35) {
          u.hitThisLunge = true
          this.hit(u, tgt)
        }
      }
      if (u.t >= (spec.lungeTime ?? 0.4)) {
        u.setState('recover')
        u.cd = spec.cooldown
      }
      return
    }
    if (u.state === 'strike') {
      if (u.t >= 0.18) {
        u.setState('recover')
        u.cd = spec.cooldown
      }
      return
    }
    if (u.state === 'recover') {
      u.vel.x *= Math.exp(-6 * dt)
      u.vel.z *= Math.exp(-6 * dt)
      if (u.t >= spec.recover) u.setState('move')
    }
  }

  private hit(u: Unit, tgt: Target) {
    let dmg = u.damage
    if (u.team === 'shadow' && u.focus && tgt === u.focus) dmg *= 1 + u.focusBonus
    if (tgt === this.host.player) this.host.hurtPlayer(dmg, u.pos)
    else if (tgt instanceof Unit) this.host.hurtUnit(tgt, dmg, u.pos, u.team === 'shadow' ? 'shadow' : 'rift')
  }

  update(dt: number, t: number) {
    const host = this.host
    for (const u of this.units) {
      u.t += dt
      u.cd = Math.max(0, u.cd - dt)
      u.flash = Math.max(0, u.flash - dt * 6)
      u.barShown = Math.max(0, u.barShown - dt)
      u.vulnerable = Math.max(0, u.vulnerable - dt)

      if (u.state === 'dead') {
        u.deadT += dt
        // A body killed in mid-air still falls to the floor.
        const floor = host.colliders.groundAt(u.pos.x, u.pos.z, u.radius, u.pos.y, 0.3)
        if (u.pos.y > floor + 0.01 || u.vel.lengthSq() > 0.01) {
          u.vel.y -= 22 * dt
          u.vel.x *= Math.exp(-3 * dt)
          u.vel.z *= Math.exp(-3 * dt)
          u.pos.addScaledVector(u.vel, dt)
          host.colliders.pushCircle(u.pos, u.radius, u.pos.y, 0.3)
