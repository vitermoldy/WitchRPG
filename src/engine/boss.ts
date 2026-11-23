import * as THREE from 'three'
import { BOSS, UNITS } from '../game/balance'
import type { Game } from './game'
import { COLOR } from './palette'
import type { DamageSource, Unit } from './units'

export type BossPhase = 1 | 2 | 3

/**
 * The Hollow Warden, in three phases (GDD):
 * 1. Open floor: it slams and calls waves of husks.
 * 2. The floor falls away; it hovers over the void inside a shell that only thrown bodies crack.
 * 3. It lands, swallows what is left of its army and is untouchable outside Reality Warp.
 */
export class BossFight {
  readonly u: Unit
  phase: BossPhase = 1
  private readonly g: Game
  private summonT = 6
  private volleyT = 4
  private collapseT = -1
  private landT = -1
  private readonly home = new THREE.Vector3()
  /** Husks called in phase 3 and when they will be swallowed. */
  private readonly feed = new Map<Unit, number>()
  private immuneNote = 0

  constructor(g: Game, u: Unit, home: THREE.Vector3) {
    this.g = g
    this.u = u
    this.home.copy(home)
    u.brainHook = (unit, dt) => this.brain(unit, dt)
  }

  get label(): string {
    if (this.phase === 1) return 'Fase 1 dari 3'
    if (this.phase === 2) return 'Fase 2: cangkang hanya retak oleh benda yang kamu lempar'
    return 'Fase 3: kebal, kecuali di dalam Reality Warp'
  }

  /** Damage after the shell has had its say. Also stops a phase from being skipped in one hit. */
  filter(amount: number, by: DamageSource, from: THREE.Vector3): number {
    const g = this.g
    const u = this.u
    let dmg = amount
    if (this.collapseT >= 0 || this.landT >= 0) return 0
    if (this.phase === 2) dmg *= by === 'impact' ? 1.5 : BOSS.shellBoltShare
    if (this.phase === 3) {
      if (!g.spells.inWarp(u.center) && !g.spells.inWarp(u.pos)) {
        if (this.immuneNote <= 0) {
          g.hud.message('Cangkangnya menutup. Kurung dia dengan Reality Warp (V) dulu.', 'chaos')
          this.immuneNote = 6
        }
        g.glow.emit({ pos: from.clone().lerp(u.center, 0.85), count: 6, color: COLOR.rift, intensity: 2, life: 0.3, size: 0.2, speed: 2 })
        return 0
      }
      // Caught in the field it reels: the shell is open and every hit goes deeper.
      dmg *= BOSS.warpDamage
    }
    // A phase cannot be skipped: damage stops just under the next threshold until the phase turns.
    if (this.phase < 3) {
      const floorHp = u.maxHp * (this.phase === 1 ? BOSS.phase2At : BOSS.phase3At) - 1
      dmg = Math.min(dmg, Math.max(0, u.hp - floorHp))
    }
    return dmg
  }

  update(dt: number) {
    const g = this.g
    const u = this.u
    this.immuneNote -= dt
    if (!u.alive) return
    const share = u.hp / u.maxHp
    if (this.phase === 1 && share <= BOSS.phase2At + 0.001 && this.collapseT < 0) this.beginCollapse()
    if (this.phase === 2 && share <= BOSS.phase3At + 0.001 && this.landT < 0) this.beginLanding()
    // From phase 2 on it never leaves the middle pillar.
    if (this.phase === 3) {
      const off = Math.hypot(u.pos.x - this.home.x, u.pos.z - this.home.z)
      if (off > 2.8) {
        u.pos.x = this.home.x + ((u.pos.x - this.home.x) / off) * 2.8
        u.pos.z = this.home.z + ((u.pos.z - this.home.z) / off) * 2.8
