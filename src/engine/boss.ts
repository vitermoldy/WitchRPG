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
      }
      u.pos.y = this.home.y
    }

    if (this.collapseT >= 0) {
      this.collapseT += dt
      // Three seconds of warning: the cracks burn, the floor shakes, then it goes.
      if (Math.random() < dt * 30) g.smoke.emit({ pos: { x: (Math.random() - 0.5) * 44, y: 0.1, z: (Math.random() - 0.5) * 44 }, count: 1, color: 0x2a1f1a, life: 1.4, size: 1.6, sizeEnd: 2.6, vel: { x: 0, y: 1.5, z: 0 }, alpha: 0.6 })
      g.player.addTrauma(dt * 0.6)
      if (this.collapseT >= 3) {
        g.lair.setFloor(false)
        g.sfx.collapse()
        g.player.addTrauma(0.8)
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2
          const r = Math.random() * 24
          g.glow.emit({ pos: { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }, count: 1, color: COLOR.rift, intensity: 2.4, life: 1.6, size: 0.3, vel: { x: 0, y: -6, z: 0 }, gravity: 10 })
        }
        this.collapseT = -1
        this.phase = 2
        this.breathe()
        this.volleyT = 2
        g.spawnRocks()
        g.hud.banner('Fase 2', 'Lantai runtuh. Lempar batu ke cangkangnya dengan Telekinesis, melayang antar pilar dengan Crimson Float.')
      }
    }
    if (this.landT >= 0) {
      this.landT += dt
      if (this.landT >= 2.2) {
        this.landT = -1
        this.phase = 3
        this.breathe()
        this.volleyT = 3
        this.summonT = 10
        // It swallows every creature still standing.
        let eaten = 0
        for (const o of g.units.enemies()) {
          if (o === u) continue
          g.streamTo(o.center, u.center, COLOR.rift)
          g.units.remove(o)
          eaten++
        }
        if (eaten) u.hp = Math.min(u.maxHp * BOSS.phase3At, u.hp + u.maxHp * 0.015 * eaten)
        g.sfx.roar()
        g.hud.banner('Fase 3', eaten ? `Ia menelan ${eaten} anak buahnya dan cangkangnya menutup. Hanya Reality Warp yang membukanya.` : 'Cangkangnya menutup. Hanya Reality Warp yang membukanya.')
      }
    }

    // Phase 3: helpers it calls are swallowed if they live long enough.
    for (const [o, at] of [...this.feed]) {
      if (!o.alive) {
        this.feed.delete(o)
        continue
      }
      if (performance.now() / 1000 > at) {
        g.streamTo(o.center, u.center, COLOR.rift)
        g.units.remove(o)
        this.feed.delete(o)
        u.hp = Math.min(u.maxHp * BOSS.phase3At, u.hp + u.maxHp * BOSS.swallowHeal)
        g.hud.message('The Hollow Warden menelan anak buahnya dan pulih.', 'info')
      }
    }
  }

  /** A new phase: the Perjanjian steadies her for a moment. */
  private breathe() {
    const p = this.g.player
    const heal = Math.round(p.maxHp * BOSS.phaseHeal)
    p.hp = Math.min(p.maxHp, p.hp + heal)
    p.mana = Math.min(p.maxMana, p.mana + BOSS.phaseMana)
    this.g.hud.message(`Perjanjian menahanmu: HP pulih ${heal}, mana pulih ${BOSS.phaseMana}.`, 'umbra')
  }

  private beginCollapse() {
    const g = this.g
    this.collapseT = 0
    g.sfx.roar()
