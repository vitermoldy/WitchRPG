import * as THREE from 'three'
import type { Colliders } from './collide'
import type { Particles } from './fx'
import { COLOR } from './palette'
import type { DamageSource, Unit, UnitSystem } from './units'

export type ShotTeam = 'rift' | 'witch'

interface Shot {
  pos: THREE.Vector3
  prev: THREE.Vector3
  vel: THREE.Vector3
  gravity: number
  radius: number
  damage: number
  team: ShotTeam
  life: number
  mesh: THREE.Mesh
  source: Unit | null
  reflected: boolean
  /** Bursts over this radius where it lands instead of hitting one thing; 0 for a plain glob. */
  blast: number
}

export interface ShotHost {
  readonly colliders: Colliders
  units: UnitSystem
  player: { pos: THREE.Vector3; alive: boolean }
  glow: Particles
  smoke: Particles
  hurtPlayer(dmg: number, from: THREE.Vector3): void
  hurtUnit(u: Unit, dmg: number, from: THREE.Vector3, by: DamageSource): void
  /** Inside an active Reality Warp field: rift shots turn around there. */
  inWarp(at: THREE.Vector3): boolean
  reflectDamage: number
  onReflect(): void
  /** A Bombard charge bursts: everything of the other side inside the radius is hit. */
  blast(at: THREE.Vector3, radius: number, damage: number, team: ShotTeam, reflected: boolean, source: Unit | null): void
}

const geo = new THREE.IcosahedronGeometry(1, 1)
const MATS: Record<'rift' | 'shadow' | 'reflected', THREE.MeshBasicMaterial> = {
  rift: new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOR.rift).multiplyScalar(2.6) }),
  shadow: new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOR.umbra).multiplyScalar(2.6) }),
  reflected: new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOR.chaos).multiplyScalar(3) }),
}

/** Arcing globs from Spitters, the boss, and shadow Spitters. */
export class Projectiles {
  readonly group = new THREE.Group()
  private readonly shots: Shot[] = []
  private readonly host: ShotHost
  private readonly seg = new THREE.Vector3()

  constructor(host: ShotHost) {
    this.host = host
  }

  /** Lobs a glob from `from` so it lands on `to`; gravity bends it into an arc. Returns the flight time. */
  fire(from: THREE.Vector3, to: THREE.Vector3, team: ShotTeam, damage: number, spec: { speed: number; gravity: number; radius: number; blast?: number }, source: Unit | null): number {
    const flat = Math.hypot(to.x - from.x, to.z - from.z)
    const t = Math.max(0.25, flat / spec.speed)
    const vel = new THREE.Vector3((to.x - from.x) / t, (to.y - from.y) / t + 0.5 * spec.gravity * t, (to.z - from.z) / t)
    const mesh = new THREE.Mesh(geo, source?.team === 'shadow' ? MATS.shadow : MATS.rift)
    mesh.scale.setScalar(spec.radius)
    mesh.position.copy(from)
    this.group.add(mesh)
    this.shots.push({ pos: from.clone(), prev: from.clone(), vel, gravity: spec.gravity, radius: spec.radius, damage, team, life: 4, mesh, source, reflected: false, blast: spec.blast ?? 0 })
    return t
  }

  clear() {
    for (const s of this.shots) this.group.remove(s.mesh)
    this.shots.length = 0
  }

  get count() {
    return this.shots.length
  }

  update(dt: number) {
    const h = this.host
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.prev.copy(s.pos)
      s.vel.y -= s.gravity * dt
      s.pos.addScaledVector(s.vel, dt)
      s.life -= dt
      s.mesh.position.copy(s.pos)
      const color = s.reflected ? COLOR.chaos : s.source?.team === 'shadow' ? COLOR.umbra : COLOR.rift
      if (Math.random() < 0.7) h.glow.emit({ pos: s.pos, count: 1, color, intensity: 2.2, life: 0.35, size: s.radius * 0.9, sizeEnd: 0.03, speed: 0.4, jitter: s.radius * 0.4 })

      // Reality Warp turns a rift glob back on whoever threw it.
      if (s.team === 'rift' && h.inWarp(s.pos)) {
        s.team = 'witch'
        s.reflected = true
        s.damage *= h.reflectDamage
        s.mesh.material = MATS.reflected
        s.gravity = 0
        const speed = Math.max(14, s.vel.length())
        const back = s.source && s.source.alive ? s.source.center.sub(s.pos) : s.vel.clone().negate()
        s.vel.copy(back.normalize().multiplyScalar(speed))
        s.life = 3
        h.glow.emit({ pos: s.pos, count: 14, color: COLOR.chaosHot, intensity: 3, life: 0.4, size: 0.2, speed: 3 })
        h.onReflect()
        continue
      }

      let hit = false
      if (s.team === 'rift') {
        // The witch: a capsule from her feet to her eyes.
        const p = h.player
        if (p.alive) {
          const y = Math.min(Math.max(s.pos.y, p.pos.y + 0.3), p.pos.y + 1.6)
          if (Math.hypot(s.pos.x - p.pos.x, s.pos.y - y, s.pos.z - p.pos.z) < s.radius + 0.42) {
            if (!s.blast) h.hurtPlayer(s.damage, s.prev)
            hit = true
          }
        }
        if (!hit) hit = this.hitUnits(s, 'shadow')
      } else {
        hit = this.hitUnits(s, 'rift')
      }
      if (!hit) {
        const len = this.seg.copy(s.pos).sub(s.prev).length()
        const wall = len > 1e-5 ? h.colliders.raycast(s.prev, this.seg.divideScalar(len), len) : null
        const floor = h.colliders.groundAt(s.pos.x, s.pos.z, 0.1, s.pos.y, 0.05)
        if (wall || s.pos.y <= floor || s.life <= 0) hit = true
      }
      if (hit && s.blast) {
        h.blast(s.pos.clone(), s.blast, s.damage, s.team, s.reflected, s.source)
        h.glow.emit({ pos: s.pos, count: 16, color, intensity: 2.4, life: 0.45, size: 0.22, sizeEnd: 0.03, speed: 3.2, gravity: 6 })
        h.smoke.emit({ pos: s.pos, count: 4, color: 0x1e1a10, life: 0.8, size: 0.6, sizeEnd: 1.1, speed: 0.8, alpha: 0.5 })
        this.group.remove(s.mesh)
        this.shots.splice(i, 1)
      }
    }
  }

  private hitUnits(s: Shot, team: 'rift' | 'shadow'): boolean {
    const h = this.host
    for (const u of h.units.units) {
      if (u.team !== team || !u.alive || u === s.source) continue
      const c = u.center
      const reach = s.radius + Math.max(u.radius, u.height * 0.42)
      if (c.distanceToSquared(s.pos) > reach * reach) continue
      h.hurtUnit(u, s.damage, s.prev, s.team === 'witch' ? (s.reflected ? 'player' : 'shadow') : 'rift')
      return true
    }
    return false
  }
}
