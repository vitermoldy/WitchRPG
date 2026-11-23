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
