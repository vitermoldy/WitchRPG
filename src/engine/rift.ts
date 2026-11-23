import * as THREE from 'three'
import { RIFT_TIER_1, type UnitKind } from '../game/balance'
import type { Game } from './game'
import { COLOR } from './palette'
import { makeTearMaterial } from './world'
import { glowTexture } from './fx'

export type RiftPhase = 'intro' | 'wave' | 'breather' | 'cleared'

interface Portal {
  pos: THREE.Vector3
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  open: number
}

/** Runs one Rift: waves out of the four tears, then the exit at the monument. */
export class RiftDirector {
