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
  mass: number
  held: boolean
  thrown: boolean
  awake: boolean
  life: number
  hitUnits: Set<number>
  hitCooldown: number
}

export interface PropHost {
  colliders: Colliders
  units: UnitSystem
  hurtUnit(u: Unit, dmg: number, from: THREE.Vector3, by: 'impact'): void
  impactFx(at: THREE.Vector3, strength: number): void
}

const CAR_COLORS = [0x5a2a2a, 0x2c3a44, 0x6b6457, 0x1f1f22, 0x3d3a2a]
let nextId = 1

function carMesh(color: number) {
  const g = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.6, flatShading: true })
