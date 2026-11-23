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

