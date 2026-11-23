import * as THREE from 'three'
import { RIFT, TIERS, UNITS, type TierSpec, type UnitKind } from '../game/balance'
import { bossUnlocked } from '../game/progression'
import type { BossFight } from './boss'
import type { Game } from './game'
import { COLOR } from './palette'
import type { Unit } from './units'
import { makeTearMaterial } from './world'
import { glowTexture } from './fx'

/**
 * intro, wave, breather: the city fight. gate: Tier III is cleared and the lair is open.
 * lair: the boss fight. cleared: the exit is open.
 */
export type RiftPhase = 'intro' | 'wave' | 'breather' | 'gate' | 'lair' | 'cleared'

interface Portal {
  pos: THREE.Vector3
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  open: number
}

type Spawn = { kind: Exclude<UnitKind, 'hollow'>; level: number }
const ORDER: Spawn['kind'][] = ['husk', 'hound', 'spitter', 'warden', 'riftlord']

/** Runs one Rift: waves out of the four tears, then the exit, or the lair at the end of Tier III. */
export class RiftDirector {
  private readonly g: Game
  tier: TierSpec = TIERS[1]
  phase: RiftPhase = 'intro'
  wave = 0
  private queue: Spawn[] = []
  private timer = 0
  private spawnT = 0
  private readonly portals: Portal[] = []
  private readonly exit: THREE.Group
  private readonly exitMat: THREE.ShaderMaterial
  private readonly gate: THREE.Group
  private readonly gateMat: THREE.ShaderMaterial
  private readonly cityExit = new THREE.Vector3(0, 0, 5.4)
  private readonly exitPos = new THREE.Vector3(0, 0, 5.4)
  elapsed = 0
  kills = 0
  xpGained = 0
  levelsGained = 0
  raised: string[] = []
  /** The big one on screen: the Rift Lord in the last wave, or the boss in the lair. */
  bossUnit: Unit | null = null
  boss: BossFight | null = null
  bossDefeated = false

  constructor(g: Game) {
    this.g = g
    g.world.portals.forEach((p, i) => {
      const mat = makeTearMaterial(i * 1.7 + 0.4)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), mat)
      mesh.position.set(p.x, 3, p.z)
      mesh.lookAt(0, 3, 0)
      mesh.renderOrder = 6
      g.world.city.add(mesh)
      this.portals.push({ pos: p.clone(), mesh, mat, open: 0 })
    })
    const tear = (seed: number, w: number, h: number, halo: number) => {
      const group = new THREE.Group()
      const mat = makeTearMaterial(seed)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      m.position.y = h / 2
      group.add(m)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(halo).multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
      glow.scale.set(w * 2.7, w * 2.7, 1)
      glow.position.y = h / 2
      group.add(glow)
      group.visible = false
      g.scene.add(group)
      return { group, mat }
    }
    const e = tear(9.3, 2.2, 3.6, COLOR.umbra)
    this.exit = e.group
    this.exitMat = e.mat
    const l = tear(4.1, 3.6, 6.2, COLOR.chaos)
    this.gate = l.group
    this.gateMat = l.mat
  }

  start(tier: TierSpec) {
    this.tier = tier
    this.phase = 'intro'
    this.wave = 0
    this.queue = []
    this.timer = 3
    this.elapsed = 0
    this.kills = 0
    this.xpGained = 0
    this.levelsGained = 0
    this.raised = []
    this.bossUnit = null
    this.boss = null
    this.bossDefeated = false
    this.exitPos.copy(this.cityExit)
    this.exit.visible = false
    this.gate.visible = false
    for (const p of this.portals) p.open = 0
  }

  get totalWaves() {
    return this.tier.waves.length
  }

  get remaining() {
    return this.queue.length + this.g.units.enemies().length
  }

  private startWave(i: number) {
    const spec = this.tier.waves[i]
    const q: Spawn[] = []
    const lv = () => spec.levels[0] + Math.floor(Math.random() * (spec.levels[1] - spec.levels[0] + 1))
    for (const kind of ORDER) for (let n = 0; n < (spec[kind] ?? 0); n++) q.push({ kind, level: lv() })
    // Shuffle so the kinds arrive mixed; the Rift Lord comes first so its wave is about it.
    const lord = q.filter((s) => s.kind === 'riftlord')
    const rest = q.filter((s) => s.kind !== 'riftlord')
    for (let n = rest.length - 1; n > 0; n--) {
      const k = Math.floor(Math.random() * (n + 1))
      ;[rest[n], rest[k]] = [rest[k], rest[n]]
    }
    this.queue = [...lord, ...rest]
    this.wave = i + 1
    this.phase = 'wave'
    this.spawnT = 0.5
    const last = i === this.totalWaves - 1
    this.g.hud.banner(
      lord.length ? 'Rift Lord' : `Gelombang ${i + 1} dari ${this.totalWaves}`,
      lord.length ? 'Penguasa retakan ini keluar sendiri. Ia memanggil husk dan menghantam tanah.' : last ? 'Gelombang terakhir. Rift mulai runtuh.' : `${q.length} makhluk keluar dari retakan.`,
    )
  }

  /** A free scaffold top for a Spitter, or null when all are taken. */
  private freePerch(): THREE.Vector3 | null {
    const taken = this.g.units.enemies().filter((u) => u.kind === 'spitter')
    const free = this.g.world.perches.filter((p) => !taken.some((u) => u.pos.distanceTo(p) < 1.5))
    return free.length ? free[Math.floor(Math.random() * free.length)].clone() : null
  }

  private spawnNext() {
    const g = this.g
    const next = this.queue.shift()!
    let at: THREE.Vector3 | null = next.kind === 'spitter' ? this.freePerch() : null
    if (!at) {
      const choices = this.portals.filter((p) => p.pos.distanceTo(g.player.pos) > 12)
      const pool = choices.length ? choices : this.portals
      const portal = pool[Math.floor(Math.random() * pool.length)]
      at = portal.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 0, (Math.random() - 0.5) * 2.5))
      at.y = 0
    }
    const u = g.units.spawn(next.kind, 'rift', next.level, at)
    if (next.kind === 'riftlord') {
      this.bossUnit = u
      g.sfx.roar()
      g.player.addTrauma(0.3)
    }
    const big = UNITS[next.kind].height / 1.8
    g.glow.emit({ pos: at.clone().setY(at.y + 1), count: Math.round(30 * big), color: COLOR.chaos, intensity: 2.2, life: 0.6, size: 0.2, speed: 3 * big, jitter: 0.4 })
    g.smoke.emit({ pos: at, count: Math.round(10 * big), color: 0x120608, life: 1, size: 1.2 * big, sizeEnd: 2 * big, speed: 1, jitter: 0.6, alpha: 0.8 })
  }

  update(dt: number) {
    const g = this.g
    this.elapsed += dt
    const t = this.elapsed
    const inCity = this.phase !== 'lair' && !(this.phase === 'cleared' && this.boss)
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
  }

  /** The exit is open and the witch is close enough to use it. */
  nearExit() {
    return this.phase === 'cleared' && Math.hypot(this.g.player.pos.x - this.exitPos.x, this.g.player.pos.z - this.exitPos.z) < 3
  }
}
