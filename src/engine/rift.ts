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
  private readonly g: Game
  phase: RiftPhase = 'intro'
  wave = 0
  private queue: { kind: UnitKind; level: number }[] = []
  private timer = 0
  private spawnT = 0
  private readonly portals: Portal[] = []
  private readonly exit: THREE.Group
  private readonly exitMat: THREE.ShaderMaterial
  // On the ground south of the monument, in view from where the witch enters.
  private readonly exitPos = new THREE.Vector3(0, 0, 5.4)
  elapsed = 0
  kills = 0
  xpGained = 0
  levelsGained = 0
  raised: string[] = []

  constructor(g: Game) {
    this.g = g
