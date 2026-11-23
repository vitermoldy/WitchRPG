import * as THREE from 'three'
import { Colliders, type Box } from './collide'
import { COLOR } from './palette'

/**
 * Jantung Rift, where The Hollow Warden waits at the end of Tier III.
 * Phase 1: a stone disc with raised slabs. Phase 2: the disc falls away and the slabs turn out to be
 * pillars over a void; the witch floats between them. Phase 3 keeps the pillars.
 */
export interface Platform {
  box: Box
  center: THREE.Vector3
  size: number
}

export interface LairBuild {
  group: THREE.Group
  colliders: Colliders
  platforms: Platform[]
  /** Where the witch steps in, on an outer pillar facing the middle. */
  playerStart: THREE.Vector3
  /** Rocks the witch can throw at the boss's shell in phase 2. */
  rockSpots: THREE.Vector3[]
  setFloor(solid: boolean): void
