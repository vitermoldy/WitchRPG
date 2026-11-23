import * as THREE from 'three'
import { SPELL, WORLD } from '../game/balance'
import { impactDamage } from '../game/progression'
import type { Colliders } from './collide'
import type { Unit, UnitSystem } from './units'

export type PropKind = 'car' | 'crate' | 'chunk'

export interface Prop {
  id: number
  kind: PropKind
  mesh: THREE.Object3D
  pos: THREE.Vector3
  vel: THREE.Vector3
  spin: THREE.Vector3
  radius: number
  halfH: number
