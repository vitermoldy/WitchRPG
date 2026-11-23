import * as THREE from 'three'
import { SHADOW, SPELL, UNITS, type UnitKind, type UnitSpec } from '../game/balance'
import { impactDamage, unitStats, type ShadowRecord } from '../game/progression'
import type { Colliders } from './collide'
import { buildModel, disposeModel, type Team, type UnitModel } from './models'
import type { Particles } from './fx'
import { COLOR } from './palette'

export type UnitState = 'spawn' | 'rising' | 'move' | 'windup' | 'strike' | 'lunge' | 'recover' | 'held' | 'air' | 'dead'
export type Command = 'follow' | 'attack' | 'hold'
export type DamageSource = 'player' | 'shadow' | 'impact' | 'rift'

export interface Target {
  pos: THREE.Vector3
  radius: number
  alive: boolean
  team: Team
}

export interface UnitHost {
  colliders: Colliders
  player: Target & { yaw: number }
  glow: Particles
  smoke: Particles
  propBlockers: { pos: THREE.Vector3; radius: number; top: number }[]
  /** Damage from a unit to the witch. */
  hurtPlayer(dmg: number, from: THREE.Vector3): void
  /** Any damage to a unit goes through the host so XP, chaos and death stay in one place. */
  hurtUnit(u: Unit, dmg: number, from: THREE.Vector3, by: DamageSource): void
  impactFx(at: THREE.Vector3, strength: number): void
  growl(): void
}

let nextId = 1

export class Unit implements Target {
  readonly id = nextId++
  readonly kind: UnitKind
  readonly team: Team
  readonly spec: UnitSpec
  level: number
  hp: number
  maxHp: number
  damage: number
  speed: number
  readonly radius: number
  readonly mass: number
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  readonly lastGood = new THREE.Vector3()
  yaw = 0
  state: UnitState = 'move'
  t = 0
  cd = 0
  target: Target | null = null
  retarget = 0
  readonly model: UnitModel
  flash = 0
  slow = 1
  vulnerable = 0
  thrown = false
  hitThisLunge = false
  lungeDir = new THREE.Vector3()
  walk = Math.random() * 6
  flank = Math.random() < 0.5 ? -1 : 1
  barShown = 0
  // Corpse.
  deadT = 0
  riteTried = false
  ash = false
  // Shadows.
  record: ShadowRecord | null = null
  command: Command = 'follow'
  holdPos = new THREE.Vector3()
  slot = 0
  focus: Unit | null = null
  focusBonus = 0

  constructor(kind: UnitKind, team: Team, level: number) {
    this.kind = kind
    this.team = team
    this.spec = UNITS[kind]
    this.level = level
    const st = unitStats(kind, level, team === 'shadow')
    this.hp = this.maxHp = st.hp
    this.damage = st.damage
    this.speed = st.speed
    this.radius = this.spec.radius
    this.mass = this.spec.mass
    this.model = buildModel(kind, team)
  }

  get alive() {
    return this.state !== 'dead'
  }

  get height() {
    return this.spec.height
  }

  get center() {
