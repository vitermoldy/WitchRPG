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
    g.hud.banner('Lantainya retak', 'Naik ke salah satu pilar sebelum lantai jatuh ke kehampaan.')
    this.u.setState('recover')
  }

  private beginLanding() {
    this.landT = 0
    this.g.sfx.roar()
    this.u.setState('recover')
  }

  private targetFor(): THREE.Vector3 | null {
    const g = this.g
    const p = g.player
    if (p.alive) return p.pos
    const s = g.units.shadows()[0]
    return s ? s.pos : null
  }

  /** Returns true when it moved the boss itself this frame; false hands over to the normal brain. */
  private brain(u: Unit, dt: number): boolean {
    const g = this.g
    const goal = this.targetFor()
    if (this.collapseT >= 0) {
      u.vel.set(0, 0, 0)
      return true
    }
    if (this.phase === 1 && this.landT < 0) {
      this.summonT -= dt
      if (this.summonT <= 0) {
        const s = UNITS.hollow.summon!
        const mine = g.units.units.filter((o) => o.owner === u && o.alive).length
        for (let i = 0; i < Math.min(s.count, s.max - mine); i++) {
          const a = (i / s.count) * Math.PI * 2
          if (g.units.units.length < 60) this.callHusk(new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9))
        }
        g.sfx.roar()
        this.summonT = s.every
      }
      return false
    }
    if (this.phase === 2 || (this.landT >= 0 && this.landT < 2.2)) {
      // Hover over the middle pillar; sink back down while landing.
      const hover = this.landT >= 0 ? this.home.y + BOSS.hoverHeight * (1 - this.landT / 2.2) : this.home.y + BOSS.hoverHeight + Math.sin(performance.now() / 700) * 0.4
      u.pos.x += (this.home.x - u.pos.x) * Math.min(1, dt * 2)
      u.pos.z += (this.home.z - u.pos.z) * Math.min(1, dt * 2)
      u.pos.y += (hover - u.pos.y) * Math.min(1, dt * 2)
      u.vel.set(0, 0, 0)
      if (goal) g.units.face(u, goal, dt, 3)
      if (this.landT < 0) this.volley(dt, BOSS.volleyShots)
      return true
    }
    // Phase 3: on the middle pillar, slams when the witch comes close, volleys when she keeps away.
    u.pos.y = this.home.y
    // Inside Reality Warp it reels and does nothing until the field lets go.
    if (g.spells.inWarp(u.center)) {
      u.stun = Math.max(u.stun, 0.25)
      u.vel.set(0, 0, 0)
      if (u.state === 'windup') u.setState('recover')
      return true
    }
    const d = goal ? Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z) : 99
    if (d > 9) {
      if (u.state === 'move') {
        u.vel.x *= Math.exp(-6 * dt)
        u.vel.z *= Math.exp(-6 * dt)
        if (goal) g.units.face(u, goal, dt, 4)
        this.volley(dt, BOSS.volleyShots)
        // Stay on the pillar.
        if (Math.hypot(u.pos.x - this.home.x, u.pos.z - this.home.z) > 2.5) u.pos.lerp(this.home.clone().setY(u.pos.y), Math.min(1, dt * 2))
        this.summonT -= dt
        if (this.summonT <= 0) {
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + Math.random()
            const h = this.callHusk(new THREE.Vector3(this.home.x + Math.cos(a) * 3, this.home.y, this.home.z + Math.sin(a) * 3))
            if (h) this.feed.set(h, performance.now() / 1000 + 9)
          }
          g.hud.message('Ia memanggil husk ke pilarnya. Habisi sebelum ditelan.', 'info')
          this.summonT = BOSS.feedEvery
        }
        return true
      }
    }
    return false
  }

  private callHusk(at: THREE.Vector3): Unit | null {
    const g = this.g
    at.y = g.colliders.groundAt(at.x, at.z, 0.5, 5, 6)
    if (at.y < -50) return null
    return g.summonUnit('husk', 9, at, 'rift', this.u)
  }

  private volley(dt: number, shots: number) {
