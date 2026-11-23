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
