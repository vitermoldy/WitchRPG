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
