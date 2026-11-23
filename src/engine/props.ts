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
    }
  })
  return g
}

const crateMat = new THREE.MeshStandardMaterial({ color: 0x4d3c2e, roughness: 0.85, flatShading: true })
const crateEdge = new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.9 })
const chunkMat = new THREE.MeshStandardMaterial({ color: 0x3b3236, roughness: 0.8, metalness: 0.3, flatShading: true })

function crateMesh() {
  const g = new THREE.Group()
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat)
  g.add(b)
  for (const y of [-0.36, 0.36]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.84), crateEdge)
    band.position.y = y
    g.add(band)
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return g
}

export class PropSystem {
  readonly props: Prop[] = []
  readonly group = new THREE.Group()
  private readonly host: PropHost
  private readonly tmp = new THREE.Vector3()

  constructor(host: PropHost) {
    this.host = host
  }

  private add(kind: PropKind, mesh: THREE.Object3D, pos: THREE.Vector3, radius: number, halfH: number, mass: number, yaw: number) {
    mesh.position.copy(pos)
    mesh.rotation.y = yaw
    this.group.add(mesh)
    const p: Prop = {
      id: nextId++,
      kind,
      mesh,
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      radius,
      halfH,
      mass,
      held: false,
      thrown: false,
      awake: false,
      life: kind === 'chunk' ? 9 : Infinity,
      hitUnits: new Set(),
      hitCooldown: 0,
    }
    this.props.push(p)
    return p
  }

  spawnCar(x: number, z: number, yaw: number) {
    return this.add('car', carMesh(CAR_COLORS[this.props.length % CAR_COLORS.length]), new THREE.Vector3(x, 0.75, z), 1.45, 0.75, 450, yaw)
  }

  spawnCrate(x: number, z: number, yaw: number, level: number) {
    return this.add('crate', crateMesh(), new THREE.Vector3(x, 0.4 + level * 0.8, z), 0.48, 0.4, 30, yaw)
  }

  spawnChunk(at: THREE.Vector3, vel: THREE.Vector3, w: number, h: number, d: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chunkMat)
    mesh.castShadow = true
    const p = this.add('chunk', mesh, at, Math.max(w, d) * 0.5, h * 0.5, 40, Math.random() * 3)
    p.vel.copy(vel)
    p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8)
    p.awake = true
    p.thrown = true
    return p
  }

  clear() {
    for (const p of this.props) this.group.remove(p.mesh)
    this.props.length = 0
  }

  wakeNear(at: THREE.Vector3, r: number) {
    for (const p of this.props) if (!p.held && p.pos.distanceTo(at) < r + p.radius) p.awake = true
  }

  push(p: Prop, impulse: THREE.Vector3, spin = 4) {
    if (p.held) return
    p.vel.addScaledVector(impulse, Math.min(2, 60 / p.mass))
    p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spin * Math.min(1, 60 / p.mass) + 1)
    p.awake = true
    p.thrown = true
    p.hitUnits.clear()
  }

  /** Things the player and units walk around. */
  blockers() {
    return this.props.filter((p) => !p.held && p.kind !== 'chunk').map((p) => ({ pos: p.pos, radius: p.radius * 0.9, top: p.pos.y + p.halfH }))
  }

  private floorFor(p: Prop) {
    let floor = this.host.colliders.groundAt(p.pos.x, p.pos.z, p.radius * 0.7, p.pos.y - p.halfH, 0.45)
    for (const o of this.props) {
      if (o === p || o.held) continue
      if (o.pos.y >= p.pos.y) continue
      const dx = o.pos.x - p.pos.x
      const dz = o.pos.z - p.pos.z
      const r = (o.radius + p.radius) * 0.65
      if (dx * dx + dz * dz < r * r) floor = Math.max(floor, o.pos.y + o.halfH)
    }
    return floor
  }

  update(dt: number) {
