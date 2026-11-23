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
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.15, metalness: 0.8 })
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111012, roughness: 0.9 })
  const lamp = new THREE.MeshStandardMaterial({ color: 0x110a05, emissive: 0xffb070, emissiveIntensity: Math.random() < 0.35 ? 1.4 : 0 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 3.2), paint)
  body.position.y = -0.1
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.5, 1.7), glass)
  cabin.position.set(0, 0.42, 0.15)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 1.5), paint)
  roof.position.set(0, 0.7, 0.18)
  g.add(body, cabin, roof)
  for (const [x, z] of [[-0.72, -1.05], [0.72, -1.05], [-0.72, 1.05], [0.72, 1.05]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10), tyre)
    w.rotation.z = Math.PI / 2
    w.position.set(x, -0.42, z)
    g.add(w)
  }
  for (const x of [-0.5, 0.5]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), lamp)
    l.position.set(x, -0.05, -1.62)
    g.add(l)
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
