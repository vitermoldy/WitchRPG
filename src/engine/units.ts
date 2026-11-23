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
