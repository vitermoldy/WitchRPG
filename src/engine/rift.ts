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
    g.world.portals.forEach((p, i) => {
      const mat = makeTearMaterial(i * 1.7 + 0.4)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), mat)
      mesh.position.set(p.x, 3, p.z)
      mesh.lookAt(0, 3, 0)
      mesh.renderOrder = 6
      g.scene.add(mesh)
      this.portals.push({ pos: p.clone(), mesh, mat, open: 0 })
    })
    this.exit = new THREE.Group()
    this.exitMat = makeTearMaterial(9.3)
    const tear = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.6), this.exitMat)
    tear.position.y = 1.8
    this.exit.add(tear)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(COLOR.umbra).multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    halo.scale.set(6, 6, 1)
    halo.position.y = 1.8
    this.exit.add(halo)
    this.exit.position.copy(this.exitPos)
    this.exit.visible = false
    g.scene.add(this.exit)
  }

  start() {
    this.phase = 'intro'
    this.wave = 0
    this.queue = []
