import * as THREE from 'three'
import type { TierId, UnitKind } from '../game/balance'
import { Colliders } from './collide'
import { glowTexture } from './fx'
import { COLOR } from './palette'
import { makeTearMaterial } from './world'

/**
 * The open city around the Rifts: roads every 80 m, about two hundred buildings drawn as one
 * instanced mesh, an altar at the central square, three Rift gates, and creature camps whose level
 * grows with the distance from the square. A curtain of Rift light closes it in.
 */
export const OW = { half: 250, pitch: 80, road: 7, ceiling: 90 } as const

export interface Gate {
  tier: TierId
  pos: THREE.Vector3
  mat: THREE.ShaderMaterial
}

export interface CampSpot {
  id: number
  pos: THREE.Vector3
  levels: [number, number]
  pack: Partial<Record<Exclude<UnitKind, 'hollow'>, number>>
  elite: boolean
  mat: THREE.ShaderMaterial
}

export interface OpenWorldBuild {
