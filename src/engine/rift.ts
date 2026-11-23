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
    this.timer = 3
    this.elapsed = 0
    this.kills = 0
    this.xpGained = 0
    this.levelsGained = 0
    this.raised = []
    this.exit.visible = false
    for (const p of this.portals) p.open = 0
  }

  get totalWaves() {
    return RIFT_TIER_1.waves.length
  }

  get remaining() {
    return this.queue.length + this.g.units.enemies().length
  }

  private startWave(i: number) {
    const spec = RIFT_TIER_1.waves[i]
    const q: { kind: UnitKind; level: number }[] = []
    const lv = () => spec.levels[0] + Math.floor(Math.random() * (spec.levels[1] - spec.levels[0] + 1))
    for (let n = 0; n < spec.husk; n++) q.push({ kind: 'husk', level: lv() })
    for (let n = 0; n < spec.hound; n++) q.push({ kind: 'hound', level: lv() })
    // Shuffle so hounds arrive mixed in with the husks.
    for (let n = q.length - 1; n > 0; n--) {
      const k = Math.floor(Math.random() * (n + 1))
      ;[q[n], q[k]] = [q[k], q[n]]
    }
    this.queue = q
    this.wave = i + 1
    this.phase = 'wave'
    this.spawnT = 0.5
    this.g.hud.banner(`Gelombang ${i + 1} dari ${this.totalWaves}`, i === this.totalWaves - 1 ? 'Gelombang terakhir. Rift mulai runtuh.' : `${q.length} makhluk keluar dari retakan.`)
  }

  update(dt: number) {
    const g = this.g
    this.elapsed += dt
    const t = this.elapsed
    for (const p of this.portals) {
      const want = this.phase === 'wave' || this.phase === 'intro' ? 1 : this.phase === 'breather' ? 0.45 : 0
      p.open += (want - p.open) * Math.min(1, dt * 1.5)
      p.mat.uniforms.uTime.value = t
      p.mat.uniforms.uOpen.value = p.open
      p.mesh.visible = p.open > 0.02
    }
    this.exitMat.uniforms.uTime.value = t

    if (this.phase === 'intro') {
      this.timer -= dt
      if (this.timer <= 0) this.startWave(0)
      return
    }
    if (this.phase === 'breather') {
      this.timer -= dt
      if (this.timer <= 0) this.startWave(this.wave)
      return
    }
    if (this.phase === 'wave') {
      this.spawnT -= dt
      if (this.queue.length && this.spawnT <= 0 && g.units.enemies().length < RIFT_TIER_1.maxAlive) {
        this.spawnT = RIFT_TIER_1.spawnInterval * (0.6 + Math.random() * 0.8)
        const next = this.queue.shift()!
        // Prefer a tear the witch is not standing next to.
        const choices = this.portals.filter((p) => p.pos.distanceTo(g.player.pos) > 12)
        const portal = (choices.length ? choices : this.portals)[Math.floor(Math.random() * (choices.length || this.portals.length))]
        const at = portal.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 0, (Math.random() - 0.5) * 2.5))
        at.y = 0
        g.units.spawn(next.kind, 'rift', next.level, at)
        g.glow.emit({ pos: at.clone().setY(1), count: 30, color: COLOR.chaos, intensity: 2.2, life: 0.6, size: 0.2, speed: 3, jitter: 0.4 })
        g.smoke.emit({ pos: at, count: 10, color: 0x120608, life: 1, size: 1.2, sizeEnd: 2, speed: 1, jitter: 0.6, alpha: 0.8 })
      }
      if (!this.queue.length && g.units.enemies().length === 0) {
        if (this.wave >= this.totalWaves) {
          this.phase = 'cleared'
          this.exit.visible = true
          g.hud.banner('Rift ditaklukkan', 'Retakan di monumen terbuka. Dekati lalu tekan F untuk keluar.')
          g.sfx.levelUp()
        } else {
          this.phase = 'breather'
          this.timer = RIFT_TIER_1.breather
          const heal = Math.round(g.player.maxHp * RIFT_TIER_1.breatherHeal)
          g.player.hp = Math.min(g.player.maxHp, g.player.hp + heal)
          g.hud.message(`Gelombang ${this.wave} habis. Jeda ${RIFT_TIER_1.breather} detik, HP pulih ${heal}.`, 'info')
        }
      }
      return
    }
    if (this.phase === 'cleared') {
      this.exit.rotation.y = Math.atan2(g.player.pos.x - this.exitPos.x, g.player.pos.z - this.exitPos.z)
      if (Math.random() < dt * 20) g.glow.emit({ pos: this.exitPos.clone().setY(this.exitPos.y + 0.3), count: 1, color: COLOR.umbra, intensity: 2.4, life: 1.4, size: 0.14, vel: { x: 0, y: 1.6, z: 0 }, jitter: 0.8 })
    }
