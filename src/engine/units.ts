import * as THREE from 'three'
import { ELITE, SHADOW, SHADOW_SKILL, SPELL, UNITS, type EliteTrait, type UnitKind, type UnitSpec } from '../game/balance'
import { impactDamage, unitStats, type ShadowRecord } from '../game/progression'
import type { Colliders } from './collide'
import { buildModel, disposeModel, type Team, type UnitModel } from './models'
import type { Particles } from './fx'
import { COLOR } from './palette'

export type UnitState = 'spawn' | 'rising' | 'sinking' | 'move' | 'windup' | 'strike' | 'lunge' | 'recover' | 'held' | 'air' | 'dead'
export type Command = 'follow' | 'attack' | 'hold'
export type DamageSource = 'player' | 'shadow' | 'impact' | 'rift'

export interface Target {
  pos: THREE.Vector3
  radius: number
  alive: boolean
  team: Team
}

export interface UnitHost {
  readonly colliders: Colliders
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
  /** A glob from a ranged unit. */
  fire(from: THREE.Vector3, to: THREE.Vector3, u: Unit): void
  /** A slam lands: dust, a ring, a shake for the witch if she is close. */
  slamFx(at: THREE.Vector3, radius: number, team: Team): void
  /** A warning circle on the floor while a slam winds up. */
  telegraph(at: THREE.Vector3, radius: number, seconds: number): void
  /** A summoner calls a helper. */
  summon(kind: UnitKind, level: number, at: THREE.Vector3, team: Team, owner: Unit): Unit | null
  /** A shadow that fell into the void comes back beside the witch. */
  recall(u: Unit): void
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
  private built: UnitModel | null = null
  /** Drawn with its own animated model. Otherwise (far shadows) the crowd draws it as one instance. */
  detailed = false
  flash = 0
  slow = 1
  vulnerable = 0
  thrown = false
  hitThisLunge = false
  lungeDir = new THREE.Vector3()
  walk = Math.random() * 6
  flank = Math.random() < 0.5 ? -1 : 1
  barShown = 0
  /** Seconds unable to act (Marsekal's pull, a Warden's guard break). */
  stun = 0
  /** Seconds of near-straight flight left after a Telekinesis throw. */
  flight = 0
  /** Seconds left floating in a Reality Warp field. */
  lifted = 0
  liftFrom = 0
  /** Seconds until a summon or a shadow skill is ready again. */
  skillCd = 0
  /** Who called this unit up; summoners keep count of their helpers. */
  owner: Unit | null = null
  /** A temporary shadow (called by a Rift Lord shadow) dissolves when this runs out. */
  temp = 0
  /** Where a slam will land, fixed at the start of the windup. */
  readonly slamAt = new THREE.Vector3()
  /** Custom behaviour (the boss); returns true when it handled this frame. */
  brainHook: ((u: Unit, dt: number) => boolean) | null = null
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
  // Elites (Tier IV and up).
  elite: EliteTrait | null = null
  /** Multiplier on windup, recovery and cooldown; below 1 is quicker. */
  tempo = 1
  /** Seconds a flier has not seen its target; it drops into the street to find it. */
  blind = 0
  /** One of the last of a wave: it goes for the witch and leaves its perch. */
  hunt = false
  scale = 1

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
    this.skillCd = this.spec.summon ? this.spec.summon.every * 0.5 : 6
  }

  /** Built the first time it is needed: a shadow at the back of a big army may never need one. */
  get model(): UnitModel {
    if (!this.built) {
      this.built = buildModel(this.kind, this.team)
      // A shadow army casts no shadows: half the draw cost per soldier, and they are shadow already.
      if (this.team === 'shadow') for (const m of this.built.meshes) m.castShadow = false
    }
    return this.built
  }

  get hasModel() {
    return !!this.built
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

  /** Forward direction on the ground. */
  get facing() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }

  setState(s: UnitState, t = 0) {
    this.state = s
    this.t = t
  }

  /** Tougher, bigger, worth more, and one trait on top. */
  makeElite(trait: EliteTrait) {
    this.elite = trait
    this.maxHp = Math.round(this.maxHp * ELITE.hp)
    this.hp = this.maxHp
    this.damage = Math.round(this.damage * ELITE.damage * 10) / 10
    this.scale = ELITE.scale
    if (trait === 'gesit') {
      this.speed *= ELITE.swift.speed
      this.tempo = ELITE.swift.tempo
    }
  }

  /** Hovering out of reach of anything that fights on foot. */
  get aloft() {
    return !!this.spec.fly && this.alive && (this.state === 'move' || this.state === 'windup')
  }
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const BIPEDS = new Set<UnitKind>(['husk', 'spitter', 'warden', 'riftlord', 'hollow', 'bombard'])
/** Ember colours of the elite traits, so a trait reads before its label does. */
const ELITE_COLOR: Record<EliteTrait, number> = { berlapis: 0xe8d8c0, gesit: 0xffd24a, meledak: COLOR.chaos, penjaga: COLOR.rift }

/** Separation cell size: wider than the two biggest radii together (boss 1.35 + Rift Lord 0.95). */
const CELL = 3
const cellKey = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096)

export class UnitSystem {
  readonly units: Unit[] = []
  private readonly grid = new Map<number, Unit[]>()
  /** Alive units of each side, gathered once a frame for target picking. */
  private riftAlive: Unit[] = []
  private shadowAlive: Unit[] = []
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
    // Rift creatures are always drawn in full; shadows start in the crowd until they are near the camera.
    if (team === 'rift') this.setDetailed(u, true)
    this.units.push(u)
    return u
  }

  remove(u: Unit) {
    const i = this.units.indexOf(u)
    if (i >= 0) this.units.splice(i, 1)
    if (u.detailed) this.group.remove(u.model.root)
    if (u.hasModel) disposeModel(u.model)
  }

  /** Gives a unit its own model in the scene, or takes it out so the crowd draws it. */
  setDetailed(u: Unit, on: boolean) {
    if (u.detailed === on) return
    u.detailed = on
    if (on) {
      u.model.root.position.copy(u.pos)
      u.model.root.rotation.y = u.yaw
      this.group.add(u.model.root)
    } else if (u.hasModel) this.group.remove(u.model.root)
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
    // The big ones only rock back a little.
    if (u.spec.anchored) {
      u.vel.addScaledVector(impulse.clone().setY(0), 0.08)
      return
    }
    const scale = 70 / u.mass
    u.vel.addScaledVector(impulse, Math.min(1.6, scale))
    if (impulse.y > 0.5) {
      u.vel.y = Math.max(u.vel.y, impulse.y * Math.min(1.4, scale))
      u.pos.y += 0.05
      u.setState('air')
    } else if (u.state !== 'air') {
      u.setState('recover', 0)
    }
  }

  /** Reality Warp: the unit floats up and cannot act until the field lets go. */
  lift(u: Unit, seconds: number) {
    if (!u.alive || u.spec.anchored || u.state === 'held') return
    if (u.lifted <= 0) u.liftFrom = u.pos.y
    u.lifted = Math.max(u.lifted, seconds)
    if (u.state !== 'air') u.setState('air')
  }

  private pickTarget(u: Unit): Target | null {
    const p = this.host.player
    let best: Target | null = null
    let bestD = Infinity
    if (u.team === 'rift') {
      if (u.hunt && p.alive) return p
      if (p.alive) {
        best = p
        // Harriers and Bombards hunt the witch herself; the army does not soak them up.
        bestD = u.pos.distanceTo(p.pos) * (u.spec.fly || u.spec.shot?.blast ? 0.35 : 0.8)
      }
      const walker = !u.spec.fly && !u.spec.shot
      for (const o of this.shadowAlive) {
        if (!o.alive || o.state === 'rising' || o.state === 'sinking') continue
        if (walker && o.aloft && o.pos.y > u.pos.y + 2.5) continue
        // A shadow Warden draws attention to itself.
        const d = u.pos.distanceTo(o.pos) * (o.kind === 'warden' ? 0.6 : 1)
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
    const range = u.command === 'hold' ? 6 : SHADOW.engageRange + (u.spec.shot ? 8 : 0)
    const walker = !u.spec.fly && !u.spec.shot
    for (const o of this.riftAlive) {
      if (!o.alive || o.state === 'spawn') continue
      if (walker && o.aloft && o.pos.y > u.pos.y + 2.5) continue
      const d = u.pos.distanceTo(o.pos)
      if (d < bestD && o.pos.distanceTo(anchor) < (u.command === 'hold' ? range : SHADOW.leash + (u.spec.shot ? 8 : 0)) && d < range + 6) {
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

  face(u: Unit, at: THREE.Vector3, dt: number, rate = 8) {
    const yaw = Math.atan2(-(at.x - u.pos.x), -(at.z - u.pos.z))
    let diff = yaw - u.yaw
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    u.yaw += diff * Math.min(1, dt * rate)
  }

  private follow(u: Unit, speed: number, dt: number) {
    if (u.command === 'hold') {
      this.steer(u, u.holdPos, speed, dt, 0.6)
      return
    }
    const p = this.host.player
    // Rings behind the witch: 8 in the first, 4 more in each ring after it.
    let ring = 0
    let index = u.slot
    while (index >= 8 + ring * 4) {
      index -= 8 + ring * 4
      ring++
    }
    const inRing = 8 + ring * 4
    const spread = Math.min(Math.PI * 1.6, 0.55 * inRing)
    const a = p.yaw + Math.PI + (index - (inRing - 1) / 2) * (spread / inRing)
    const dist = SHADOW.followDistance + u.radius + ring * 1.8
    tmp2.set(p.pos.x - Math.sin(a) * dist, 0, p.pos.z - Math.cos(a) * dist)
    const far = u.pos.distanceTo(p.pos) > 9
    this.steer(u, tmp2, far ? speed * 1.6 : speed, dt, 0.8)
  }

  /** Abilities that run beside the normal fight: summons and the big shadows' skills. */
  private skills(u: Unit, dt: number) {
    u.skillCd -= dt
    if (u.skillCd > 0 || u.state === 'air' || u.stun > 0) return
    const host = this.host
    if (u.team === 'rift' && u.spec.summon && u.kind !== 'hollow') {
      const s = u.spec.summon
      const mine = this.units.filter((o) => o.owner === u && o.alive).length
      if (mine < s.max && u.target) {
        for (let i = 0; i < s.count; i++) {
          const a = u.yaw + (i - (s.count - 1) / 2) * 0.9 + Math.PI
          host.summon('husk', u.level, tmp.set(u.pos.x + Math.sin(a) * 2.6, u.pos.y, u.pos.z + Math.cos(a) * 2.6).clone(), 'rift', u)
        }
        host.growl()
      }
      u.skillCd = s.every
      return
    }
    if (u.team !== 'shadow') return
    const enemiesNear = this.units.filter((o) => o.team === 'rift' && o.alive && o.pos.distanceTo(u.pos) < 14)
    if (u.kind === 'riftlord') {
      if (!enemiesNear.length) return
      const c = SHADOW_SKILL.call
      for (let i = 0; i < c.count; i++) {
        const a = u.yaw + (i ? 1 : -1) * 1.2
        const h = host.summon('husk', u.level, tmp.set(u.pos.x + Math.sin(a) * 2, u.pos.y, u.pos.z + Math.cos(a) * 2).clone(), 'shadow', u)
        if (h) h.temp = c.lasts
      }
      u.skillCd = c.every
    } else if (u.kind === 'hollow') {
      const p = SHADOW_SKILL.pull
      const caught = enemiesNear.filter((o) => o.pos.distanceTo(u.pos) < p.radius && !o.spec.anchored)
      if (!caught.length) return
      for (const o of caught) {
        tmp.copy(u.pos).sub(o.pos).setY(0)
        const d = tmp.length()
        tmp.normalize().multiplyScalar(Math.min(14, d * 2.2))
        o.vel.add(tmp)
        o.stun = Math.max(o.stun, p.stun)
        if (o.state === 'windup' || o.state === 'lunge') o.setState('recover')
      }
      host.slamFx(u.pos, p.radius, 'shadow')
      u.skillCd = p.every
    }
  }

  private brain(u: Unit, dt: number) {
    if (u.brainHook && u.brainHook(u, dt)) return
    u.retarget -= dt
    if (u.retarget <= 0 || !u.target || !u.target.alive) {
      u.target = this.pickTarget(u)
      u.retarget = 0.4 + Math.random() * 0.3
    }
    this.skills(u, dt)
    if (u.stun > 0) {
      u.vel.x *= Math.exp(-5 * dt)
      u.vel.z *= Math.exp(-5 * dt)
      if (u.spec.fly) u.vel.y = Math.max(u.vel.y - 9 * dt, -6)
      return
    }
    const spec = u.spec
    const speed = u.speed * u.slow
    const tgt = u.target
    if (spec.fly) {
      this.flyer(u, dt, tgt, speed)
      return
    }
    const perched = u.spec.shot && u.pos.y > 2.5
    if (u.state === 'move') {
      if (!tgt) {
        if (u.team === 'shadow') {
          // Out of the fight, shadows knit back together.
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * SHADOW.regen * dt)
          this.follow(u, speed, dt)
        } else this.steer(u, u.pos, 0, dt)
        return
      }
      const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z) - tgt.radius
      if (spec.shot) {
        const sees = this.host.colliders.clear(u.center, tmp.set(tgt.pos.x, tgt.pos.y + 1, tgt.pos.z))
        // A Bombard lobs over cover, so it fires on range alone; it still walks in until it can see its target.
        if (d < spec.attackRange && u.cd <= 0 && (sees || spec.shot.blast)) {
          u.setState('windup')
          return
        }
        if (perched && !u.hunt) {
          // A Spitter on a ledge holds it and turns to watch.
          this.steer(u, u.pos, 0, dt)
          this.face(u, tgt.pos, dt, 4)
          return
        }
        // Keep a gap: back off when close, close in when it cannot see or is too far.
        if (d < spec.shot.keepAway) {
          tmp2.set(u.pos.x * 2 - tgt.pos.x, 0, u.pos.z * 2 - tgt.pos.z)
          this.steer(u, tmp2, speed, dt, 0)
          this.face(u, tgt.pos, dt, 6)
        } else if (!sees || d > spec.attackRange * 0.8) this.steer(u, tgt.pos, speed, dt, spec.shot.keepAway)
        else this.steer(u, u.pos, 0, dt)
        return
      }
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
        return
      }
      if (d < spec.attackRange - 0.2 && u.cd <= 0) {
        u.setState('windup')
        if (spec.slam) {
          // The slam lands where the target stood when the arms went up: step out of the circle.
          u.slamAt.copy(u.pos).addScaledVector(u.facing, Math.min(spec.slam * 0.4, d * 0.6))
          if (u.team === 'rift') this.host.telegraph(u.slamAt, spec.slam, spec.windup)
        }
        if (Math.random() < 0.35 || spec.slam) this.host.growl()
        return
      }
      this.steer(u, tgt.pos, speed, dt, spec.attackRange - 0.4)
      return
    }
    if (u.state === 'windup') {
      u.vel.x *= Math.exp(-10 * dt)
      u.vel.z *= Math.exp(-10 * dt)
      if (tgt && !spec.slam) this.face(u, tgt.pos, dt, 12)
      if (u.t >= (spec.windup * u.tempo) / Math.max(0.4, u.slow)) {
        if (u.kind === 'hound' && tgt) {
          u.lungeDir.set(tgt.pos.x - u.pos.x, 0, tgt.pos.z - u.pos.z).normalize()
          u.hitThisLunge = false
          u.setState('lunge')
        } else if (spec.shot && tgt && tgt.alive) {
          const from = u.center.add(u.facing.multiplyScalar(u.radius + 0.3))
          from.y += u.height * 0.25
          this.host.fire(from, new THREE.Vector3(tgt.pos.x, tgt.pos.y + 1, tgt.pos.z), u)
          u.setState('strike')
        } else if (spec.slam) {
          this.slam(u)
          u.setState('strike')
        } else {
          u.setState('strike')
          if (tgt && tgt.alive) {
            const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z) - tgt.radius
            tmp2.set(tgt.pos.x - u.pos.x, 0, tgt.pos.z - u.pos.z).normalize()
            // A claw only reaches what is beside it, not a witch flying overhead.
            const level = Math.abs(tgt.pos.y - u.pos.y) < u.height + 0.8
            if (d < spec.attackRange + 0.45 && u.facing.dot(tmp2) > 0.3 && level) this.hit(u, tgt)
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
        if (d < u.radius + tgt.radius + 0.35 && Math.abs(tgt.pos.y - u.pos.y) < u.height + 0.8) {
          u.hitThisLunge = true
          this.hit(u, tgt)
        }
      }
      if (u.t >= (spec.lungeTime ?? 0.4)) {
        u.setState('recover')
        u.cd = spec.cooldown * u.tempo
      }
      return
    }
    if (u.state === 'strike') {
      if (u.t >= 0.18) {
        u.setState('recover')
        u.cd = spec.cooldown * u.tempo
      }
      return
    }
    if (u.state === 'recover') {
      u.vel.x *= Math.exp(-6 * dt)
      u.vel.z *= Math.exp(-6 * dt)
      if (u.t >= spec.recover * u.tempo) u.setState('move')
    }
  }

  /**
   * Harriers: circle the target high up, dive at it after a screech, then climb back.
   * They ride above the higher of the ground and their target, so they follow a flying witch up.
   */
  private flyer(u: Unit, dt: number, tgt: Target | null, speed: number) {
    const host = this.host
    const spec = u.spec
    const floor = host.colliders.groundAt(u.pos.x, u.pos.z, u.radius, u.pos.y, 0.3)
    const ref = tgt ?? host.player
    const sees = !tgt || host.colliders.clear(u.center, tmp.set(tgt.pos.x, tgt.pos.y + 1, tgt.pos.z))
    u.blind = sees ? 0 : u.blind + dt
    const lost = u.blind > 1.5
    // Ride above the target, not above whatever roof is underneath; lower when it has lost sight of it.
    // Shadows ride lower, so they stay in the fight around the witch.
    const height = lost ? 2.5 : u.team === 'shadow' ? spec.fly!.height * 0.6 : spec.fly!.height
    const cruise = Math.max(floor + 2, ref.pos.y + height) + Math.sin(u.walk * 0.3 + u.id) * 0.6
    const climb = (goal: number, rate: number) => {
      u.vel.y += ((goal - u.pos.y) * rate - u.vel.y) * Math.min(1, dt * 4)
    }
    if (u.state === 'move') {
      climb(cruise, 1.5)
      if (!tgt) {
        if (u.team === 'shadow') {
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * SHADOW.regen * dt)
          this.follow(u, speed, dt)
        } else this.steer(u, u.pos, 0, dt)
        return
      }
      // Circle the target at dive distance; close in tight when a wall or roof hides it.
      const r = lost ? 3 : 9
      const a = Math.atan2(u.pos.z - tgt.pos.z, u.pos.x - tgt.pos.x) + u.flank * 0.8
      tmp2.set(tgt.pos.x + Math.cos(a) * r, 0, tgt.pos.z + Math.sin(a) * r)
      this.steer(u, tmp2, speed, dt, 0)
      this.face(u, tgt.pos, dt, 6)
      if (u.cd <= 0 && sees && u.pos.distanceTo(tgt.pos) < spec.attackRange) {
        u.setState('windup')
        host.growl()
      }
      return
    }
    if (u.state === 'windup') {
      u.vel.x *= Math.exp(-6 * dt)
      u.vel.z *= Math.exp(-6 * dt)
      climb(cruise + 1.2, 2)
      if (tgt) this.face(u, tgt.pos, dt, 12)
      if (u.t >= (spec.windup * u.tempo) / Math.max(0.4, u.slow)) {
        if (!tgt || !tgt.alive) {
          u.setState('recover')
          return
        }
        u.lungeDir.set(tgt.pos.x - u.pos.x, tgt.pos.y + 0.9 - (u.pos.y + 0.5), tgt.pos.z - u.pos.z).normalize()
        u.hitThisLunge = false
        u.setState('lunge')
      }
      return
    }
    if (u.state === 'lunge') {
      u.vel.copy(u.lungeDir).multiplyScalar((spec.lungeSpeed ?? 16) * u.slow)
      if (tgt && tgt.alive && !u.hitThisLunge) {
        const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.y + 0.9 - (u.pos.y + 0.5), tgt.pos.z - u.pos.z)
        if (d < u.radius + tgt.radius + 0.7) {
          u.hitThisLunge = true
          this.hit(u, tgt)
        }
      }
      if (u.hitThisLunge || u.t >= (spec.lungeTime ?? 0.8) || u.pos.y <= floor + 0.5) {
        u.setState('recover')
        u.cd = spec.cooldown * u.tempo
      }
      return
    }
    // Recovering, or back on its feet after a fall: pull up to cruising height.
    u.vel.x *= Math.exp(-2.5 * dt)
    u.vel.z *= Math.exp(-2.5 * dt)
    climb(cruise, 2)
    if (u.t >= spec.recover * u.tempo) u.setState('move')
  }

  /** A slam hits every target of the other side inside its circle. */
  slam(u: Unit, at = u.slamAt, radius = u.spec.slam ?? 4, damage = u.damage) {
    const host = this.host
    host.slamFx(at, radius, u.team)
    if (u.team === 'rift') {
      const p = host.player
      if (p.alive && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < radius + p.radius && p.pos.y < at.y + 2.5) host.hurtPlayer(damage, at)
    }
    for (const o of this.units) {
      if (o.team === u.team || !o.alive || o === u) continue
      const d = Math.hypot(o.pos.x - at.x, o.pos.z - at.z)
      if (d > radius + o.radius) continue
      host.hurtUnit(o, damage * (1 - 0.4 * (d / radius)), at, u.team === 'shadow' ? 'shadow' : 'rift')
      tmp.set(o.pos.x - at.x, 0, o.pos.z - at.z).normalize().multiplyScalar(6)
      tmp.y = 4
      this.knock(o, tmp)
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
    this.riftAlive = this.units.filter((u) => u.team === 'rift' && u.alive)
    this.shadowAlive = this.units.filter((u) => u.team === 'shadow' && u.alive)
    for (const u of [...this.units]) {
      u.t += dt
      u.cd = Math.max(0, u.cd - dt)
      u.flash = Math.max(0, u.flash - dt * 6)
      u.barShown = Math.max(0, u.barShown - dt)
      u.vulnerable = Math.max(0, u.vulnerable - dt)
      u.stun = Math.max(0, u.stun - dt)

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
          if (u.pos.y <= floor) {
            u.pos.y = floor
            u.vel.set(0, 0, 0)
          }
        }
        continue
      }
      if (u.temp > 0) {
        u.temp -= dt
        if (u.temp <= 0) {
          host.smoke.emit({ pos: u.pos, count: 10, color: 0x170a28, life: 1, size: 0.9, sizeEnd: 1.5, speed: 1, vel: { x: 0, y: 1, z: 0 }, alpha: 0.8 })
          this.remove(u)
          continue
        }
      }
      if (u.state === 'spawn') {
        if (u.t > 0.7) u.setState('move')
        continue
      }
      if (u.state === 'rising') {
        if (u.t > 1.2) {
          u.setState('move')
          // The eyes light last.
          if (u.team === 'shadow') host.glow.emit({ pos: u.center.setY(u.pos.y + u.height * 0.92), count: 5, color: COLOR.umbraHot, intensity: 4, life: 0.4, size: 0.3 + u.height * 0.08, sizeEnd: 0.05, speed: 0.6 })
        }
        continue
      }
      if (u.state === 'sinking') {
        if (u.t > 0.8) this.remove(u)
        continue
      }
      if (u.state === 'held') continue

      if (u.state === 'air') {
        if (u.lifted > 0) {
          // Floating in a Reality Warp field: drift up to the ceiling of the field and hang there.
          u.lifted -= dt
          const goal = u.liftFrom + SPELL.warp.liftHeight
          u.vel.y += ((goal - u.pos.y) * 3 - u.vel.y) * Math.min(1, dt * 4)
          u.vel.x *= Math.exp(-3 * dt)
          u.vel.z *= Math.exp(-3 * dt)
          u.yaw += dt * 1.5
          u.pos.addScaledVector(u.vel, dt)
          // When the field lets go, the fall counts as a throw.
          if (u.lifted <= 0) u.thrown = true
          continue
        }
        u.flight = Math.max(0, u.flight - dt)
        u.vel.y -= 22 * dt * (u.flight > 0 ? SPELL.grip.flightGravity : 1)
        u.pos.addScaledVector(u.vel, dt)
        const n = new THREE.Vector3()
        const wall = host.colliders.pushCircle(u.pos, u.radius, u.pos.y, 0.3, n)
        const speed = u.vel.length()
        if (wall && u.thrown && speed > SPELL.impact.minSpeed) {
          this.impact(u, speed, null)
          u.vel.reflect(n).multiplyScalar(0.3)
        }
        if (u.thrown && speed > SPELL.impact.minSpeed) {
          for (const o of this.units) {
            if (o === u || !o.alive || o.team !== 'rift' || o.state === 'held') continue
            const reach = u.radius + o.radius + 0.25
            if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach && u.pos.y < o.pos.y + o.height && u.pos.y + u.height > o.pos.y) {
              this.impact(u, speed, o)
              u.vel.multiplyScalar(0.4)
              break
            }
          }
        }
        const floor = host.colliders.groundAt(u.pos.x, u.pos.z, u.radius, u.pos.y, 0.3)
        if (u.pos.y <= floor) {
          u.pos.y = floor
          if (u.thrown && u.vel.length() > SPELL.impact.minSpeed) this.impact(u, u.vel.length(), null)
          u.vel.y = 0
          u.vel.x *= 0.3
          u.vel.z *= 0.3
          u.thrown = false
          // A Warden that lands hard loses its guard for a moment.
          if (u.alive && u.kind === 'warden' && speed > SPELL.impact.minSpeed) u.stun = Math.max(u.stun, 2)
          if (u.alive) u.setState('recover', 0.2)
        }
        this.fellOut(u)
        continue
      }

      this.brain(u, dt)
      if (!u.alive) continue
      u.pos.x += u.vel.x * dt
      u.pos.z += u.vel.z * dt
      if (u.spec.fly && !u.brainHook) {
        u.pos.y += u.vel.y * dt
        host.colliders.pushCircle(u.pos, u.radius, u.pos.y, 0.3)
        const floor = host.colliders.groundAt(u.pos.x, u.pos.z, u.radius, u.pos.y, 0.3)
        if (u.pos.y < floor + 0.15) {
          u.pos.y = floor + 0.15
          if (u.vel.y < 0) u.vel.y = 0
        }
        if (u.pos.y > floor + 26 && u.vel.y > 0) u.vel.y = 0
        this.fellOut(u)
      } else if (!u.brainHook) {
        u.vel.y = 0
        host.colliders.pushCircle(u.pos, u.radius, u.pos.y, 0.3)
        const floor = host.colliders.groundAt(u.pos.x, u.pos.z, u.radius, u.pos.y, 0.3)
        // Walking off an edge over the void is a fall, not a glide.
        if (floor < u.pos.y - 1) {
          u.setState('air')
          continue
        }
        u.pos.y += (floor - u.pos.y) * Math.min(1, dt * 12)
      }
      for (const b of host.propBlockers) {
        const dx = u.pos.x - b.pos.x
        const dz = u.pos.z - b.pos.z
        const min = u.radius + b.radius
        const d2 = dx * dx + dz * dz
        if (d2 < min * min && d2 > 1e-6 && u.pos.y < b.top - 0.1) {
          const d = Math.sqrt(d2)
          u.pos.x = b.pos.x + (dx / d) * min
          u.pos.z = b.pos.z + (dz / d) * min
        }
      }
    }

    // Separation so crowds spread instead of stacking. The big ones push, they are not pushed.
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i]
      if (!a.alive || a.state === 'held' || a.state === 'air' || a.state === 'sinking') continue
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j]
        if (!b.alive || b.state === 'held' || b.state === 'air' || b.state === 'sinking') continue
        if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue
        const dx = a.pos.x - b.pos.x
        const dz = a.pos.z - b.pos.z
        const min = a.radius + b.radius
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min || d2 < 1e-8) continue
        const d = Math.sqrt(d2)
        const share = a.mass / (a.mass + b.mass)
        const push = min - d
        a.pos.x += (dx / d) * push * (1 - share)
        a.pos.z += (dz / d) * push * (1 - share)
        b.pos.x -= (dx / d) * push * share
        b.pos.z -= (dz / d) * push * share
      }
      // Keep clear of the witch.
      const p = host.player
      const dx = a.pos.x - p.pos.x
      const dz = a.pos.z - p.pos.z
      const min = a.radius + p.radius
      const d2 = dx * dx + dz * dz
      if (d2 < min * min && d2 > 1e-8 && Math.abs(a.pos.y - p.pos.y) < 1.4) {
        const d = Math.sqrt(d2)
        a.pos.x = p.pos.x + (dx / d) * min
        a.pos.z = p.pos.z + (dz / d) * min
      }
    }

    for (const u of this.units) {
      // A unit with a broken number goes back to its last good spot instead of infecting its neighbours.
      if (!Number.isFinite(u.pos.x + u.pos.y + u.pos.z + u.vel.x + u.vel.y + u.vel.z + u.yaw)) {
        u.pos.copy(u.lastGood)
        u.vel.set(0, 0, 0)
        if (!Number.isFinite(u.yaw)) u.yaw = 0
      } else u.lastGood.copy(u.pos)
      this.animate(u, dt, t)
    }
  }

  /** Below the platforms of the lair: enemies are lost, shadows come back to the witch. */
  private fellOut(u: Unit) {
    if (u.pos.y > -8 || !u.alive) return
    if (u.team === 'shadow') this.host.recall(u)
    else this.host.hurtUnit(u, 1e6, u.pos, 'impact')
  }

  private impact(u: Unit, speed: number, other: Unit | null) {
    const c = SPELL.impact
    const dmg = impactDamage(u.mass, speed, c.coefficient, c.exponent)
    this.host.impactFx(u.center, Math.min(1, dmg / 60))
    this.host.hurtUnit(u, dmg, u.pos, 'impact')
    if (other) {
      this.host.hurtUnit(other, dmg, u.pos, 'impact')
      tmp.copy(u.vel).setY(0).normalize().multiplyScalar(6)
      tmp.y = 3
      this.knock(other, tmp)
    }
    u.thrown = false
  }

  /** Procedural animation from state and speed. */
  private animate(u: Unit, dt: number, t: number) {
    const m = u.model
    const P = m.parts
    m.root.position.copy(u.pos)
    m.root.rotation.y = u.yaw
    const speed = Math.hypot(u.vel.x, u.vel.z)
    const stride = u.kind === 'hound' ? 2.6 : 3.4 / Math.max(1, u.height / 1.8)
    u.walk += dt * speed * stride
    const sw = Math.sin(u.walk)
    const amp = Math.min(1, speed / Math.max(1, u.speed))
    const flashCol = u.team === 'rift' ? 0xffffff : COLOR.umbraHot
    // A corpse's glow belongs to the rite system, which sets it every frame.
    if (u.flash > 0) {
      m.bodyMat.emissive.set(flashCol)
      m.bodyMat.emissiveIntensity = u.flash * 1.2
    } else if (u.state === 'dead') {
      if (u.team === 'shadow') m.bodyMat.emissiveIntensity = 0
    } else if (u.team === 'shadow') {
      m.bodyMat.emissive.set(COLOR.umbraDeep)
      m.bodyMat.emissiveIntensity = (u.temp > 0 ? 0.35 : 0.55) + Math.sin(t * 3 + u.id) * 0.15
    } else if (u.stun > 0) {
      m.bodyMat.emissive.set(COLOR.umbra)
      m.bodyMat.emissiveIntensity = 0.35 + Math.sin(t * 12) * 0.15
    } else {
      // A faint inner ember so rift bodies read against the dark streets.
      m.bodyMat.emissive.set(0x3a1606)
      m.bodyMat.emissiveIntensity = 0.55
    }
    if (P.shards) P.shards.rotation.y += dt * (u.alive ? 0.7 : 0.1)
    if (P.core) (P.core as THREE.Mesh).rotation.y += dt * 2

    if (u.state === 'spawn') {
      const k = Math.min(1, u.t / 0.7)
      m.root.scale.setScalar(0.3 + 0.7 * k)
      return
    }
    if (u.state === 'rising') {
      const k = Math.min(1, u.t / 1.2)
      m.root.position.y = u.pos.y - (1 - k) * (1 - k) * u.spec.height
      m.root.scale.setScalar(1)
      if (Math.random() < 0.6) {
        this.host.smoke.emit({ pos: u.pos, count: 2, color: 0x1a0a2e, life: 1.2, size: 0.9, sizeEnd: 1.6, speed: 0.6, vel: { x: 0, y: 1.4, z: 0 }, jitter: 0.5, alpha: 0.8 })
        this.host.glow.emit({ pos: u.pos, count: 1, color: COLOR.umbra, intensity: 2.5, life: 0.8, size: 0.1, speed: 1, vel: { x: 0, y: 2.5, z: 0 }, jitter: 0.4 })
      }
      return
    }
    if (u.state === 'sinking') {
      const k = Math.min(1, u.t / 0.8)
      m.root.position.y = u.pos.y - k * k * u.spec.height
      if (Math.random() < 0.5) this.host.glow.emit({ pos: u.pos, count: 1, color: COLOR.umbra, intensity: 2.4, life: 0.6, size: 0.1, speed: 0.8, vel: { x: 0, y: 1.6, z: 0 }, jitter: 0.4 })
      return
    }
    m.root.scale.setScalar(1)

    if (BIPEDS.has(u.kind)) this.animateBiped(u, sw, amp, t)
    else this.animateHound(u, amp, t)
  }

  private animateBiped(u: Unit, sw: number, amp: number, t: number) {
    const m = u.model
    const P = m.parts
    const hip = (m.body.userData.hip as number) ?? 0.95
    const baseLean = (P.spine.userData.lean as number) ?? 0.42
    const { legL, legR, armL, armR } = P
    const slammer = !!u.spec.slam
    let armX = 0
    let lean = baseLean
    let shieldUp = u.kind === 'warden' && u.stun <= 0
    if (u.state === 'windup') {
      const k = Math.min(1, u.t / u.spec.windup)
      if (u.spec.shot) {
        lean = baseLean - 0.5 * k
        armX = 0
      } else {
        armX = (slammer ? -3 : -2.4) * k
        lean = baseLean - (slammer ? 0.35 : 0.3) * k
      }
    } else if (u.state === 'strike') {
      const k = Math.min(1, u.t / 0.12)
      armX = u.spec.shot ? 0 : (slammer ? -3 : -2.4) + k * (slammer ? 3.6 : 3.1)
      lean = u.spec.shot ? baseLean + 0.3 : baseLean + 0.3
    } else if (u.state === 'held' || u.state === 'air') {
      armX = Math.sin(t * 18 + u.id) * 1.2 - 1
      lean = 0.1
      shieldUp = false
    } else if (u.state === 'recover') {
      armX = 0.6 * (1 - Math.min(1, u.t / 0.4))
    }
    if (u.stun > 0) {
      lean = baseLean + 0.25
      armX = 0.4
    }
    if (u.state === 'dead') {
      const k = Math.min(1, u.deadT / 0.6)
      m.body.rotation.x = -k * 1.45
      m.body.position.y = hip - k * hip * 0.72
      legL.rotation.x = k * 0.3
      legR.rotation.x = k * 0.5
      armL.rotation.x = -k * 2.6
      armR.rotation.x = -k * 2.2
      return
    }
    m.body.rotation.x = 0
    m.body.position.y = hip + Math.abs(sw) * 0.04 * amp * (hip / 0.95)
    P.spine.rotation.x = lean
    legL.rotation.x = sw * 0.65 * amp
    legR.rotation.x = -sw * 0.65 * amp
    P.kneeL.rotation.x = Math.max(0, -sw) * 0.8 * amp
    P.kneeR.rotation.x = Math.max(0, sw) * 0.8 * amp
    armL.rotation.x = armX + (armX === 0 ? -sw * 0.4 * amp : 0)
    armR.rotation.x = armX + (armX === 0 ? sw * 0.4 * amp : 0)
    armL.rotation.z = -0.15
    armR.rotation.z = 0.15
    // The Warden keeps its shield across its body unless knocked off balance.
    if (shieldUp && u.state !== 'windup' && u.state !== 'strike') {
      armL.rotation.x = -1.2
      armL.rotation.z = 0.5
      P.foreL.rotation.x = -0.3
    } else if (u.kind === 'warden') P.foreL.rotation.x = 0
    if (u.kind === 'spitter' && P.sac) P.sac.scale.setScalar(u.state === 'windup' ? 1 + Math.min(1, u.t / u.spec.windup) * 0.5 : 1)
    P.jaw.rotation.x = u.state === 'windup' ? 0.5 : Math.sin(t * 2 + u.id) * 0.08 + 0.1
    P.head.rotation.x = u.kind === 'husk' ? -0.25 : -baseLean * 0.6
  }

  private animateHound(u: Unit, amp: number, t: number) {
    const m = u.model
    const P = m.parts
    const legs = ['legFL', 'legFR', 'legBL', 'legBR']
    const phase = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5]
    if (u.state === 'dead') {
      const k = Math.min(1, u.deadT / 0.5)
      m.body.rotation.z = k * 1.5
      m.body.position.y = 0.72 - k * 0.42
      return
    }
    m.body.rotation.z = 0
    let crouch = 0
    let stretch = 0
    if (u.state === 'windup') crouch = Math.min(1, u.t / u.spec.windup)
    if (u.state === 'lunge') stretch = 1
    m.body.position.y = 0.72 - crouch * 0.22 + Math.abs(Math.sin(u.walk)) * 0.05 * amp
    m.body.rotation.x = crouch * 0.12 - stretch * 0.15
    for (let i = 0; i < 4; i++) {
      const hip = P[legs[i]]
      const s = Math.sin(u.walk + phase[i])
      hip.rotation.x = stretch ? (i < 2 ? -1.1 : 1.1) : s * 0.75 * amp + crouch * (i < 2 ? -0.5 : 0.6)
      ;(hip.userData.knee as THREE.Object3D).rotation.x = stretch ? 0.2 : Math.max(0, -s) * 0.9 * amp + crouch * 0.8
    }
    P.jaw.rotation.x = u.state === 'windup' || u.state === 'lunge' ? 0.7 : 0.1 + Math.sin(t * 3 + u.id) * 0.05
    P.head.rotation.x = crouch * 0.3
    P.tail.rotation.y = Math.sin(t * 5 + u.id) * 0.4
    if (u.state === 'held' || u.state === 'air') {
      for (let i = 0; i < 4; i++) P[legs[i]].rotation.x = Math.sin(t * 20 + i) * 0.9
    }
  }
}
