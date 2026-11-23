import * as THREE from 'three'
import { COLOR } from './palette'
import { Particles, glowTexture } from './fx'

export type Side = 'left' | 'right'
export type PoseName = 'idle' | 'cast' | 'grip' | 'push' | 'rite' | 'command' | 'block' | 'lowered'

interface Pose {
  curl: number
  spread: number
  reach: number
  lift: number
  twist: number
  palmDown: number
  tremble: number
  glow: number
}

const POSES: Record<PoseName, Pose> = {
  idle: { curl: 0.38, spread: 0.08, reach: 0, lift: 0, twist: 0, palmDown: 0, tremble: 0, glow: 0.35 },
  cast: { curl: 0.12, spread: 0.35, reach: 0.06, lift: 0.04, twist: 0.1, palmDown: 0, tremble: 0, glow: 0.9 },
  grip: { curl: 0.62, spread: 0.5, reach: 0.13, lift: 0.08, twist: 0.25, palmDown: -0.1, tremble: 1, glow: 1.25 },
  push: { curl: 0, spread: 0.55, reach: 0.17, lift: 0.06, twist: 0.15, palmDown: 0, tremble: 0.2, glow: 1.7 },
  rite: { curl: 0.22, spread: 0.45, reach: 0.09, lift: 0, twist: 0.15, palmDown: 0.8, tremble: 0.6, glow: 1.35 },
  command: { curl: 0.55, spread: 0.1, reach: 0.05, lift: 0.15, twist: -0.2, palmDown: -0.2, tremble: 0, glow: 0.8 },
  block: { curl: 0.08, spread: 0.3, reach: 0.11, lift: 0.12, twist: 0.45, palmDown: -0.1, tremble: 0.3, glow: 1.4 },
  lowered: { curl: 0.5, spread: 0, reach: -0.05, lift: -0.34, twist: 0, palmDown: 0.3, tremble: 0, glow: 0.15 },
}

interface Finger {
  joints: THREE.Object3D[]
  baseSpread: number
}

interface Hand {
  side: Side
  root: THREE.Group
  wrist: THREE.Group
  fingers: Finger[]
  thumb: THREE.Object3D[]
  orb: THREE.Sprite
  light: THREE.PointLight
  sigil: THREE.MeshStandardMaterial
  cuff: THREE.MeshStandardMaterial
  base: THREE.Vector3
  baseRot: THREE.Euler
  pose: Pose
  target: PoseName
  hold: number
  kick: number
  flash: number
  color: THREE.Color
  overloadColor: THREE.Color
}

// Fitted dark gloves: the glowing sigils carry the colour, the hands read as silhouettes.
const skinMat = () => new THREE.MeshStandardMaterial({ color: 0x4a3640, roughness: 0.4, metalness: 0.15 })

function sigilShape(): THREE.BufferGeometry {
  // A small crossing mark on the back of the hand. Thin boxes merged by hand.
  const parts = [
    new THREE.BoxGeometry(0.006, 0.07, 0.002),
    new THREE.BoxGeometry(0.045, 0.006, 0.002).translate(0, 0.012, 0),
    new THREE.BoxGeometry(0.004, 0.03, 0.002).rotateZ(0.7).translate(-0.012, -0.02, 0),
    new THREE.BoxGeometry(0.004, 0.03, 0.002).rotateZ(-0.7).translate(0.012, -0.02, 0),
  ]
  const geo = new THREE.BufferGeometry()
  const pos: number[] = []
  const idx: number[] = []
  let off = 0
  for (const p of parts) {
    const pa = p.getAttribute('position')
    for (let i = 0; i < pa.count; i++) pos.push(pa.getX(i), pa.getY(i), pa.getZ(i))
    const ia = p.getIndex()!
    for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i) + off)
    off += pa.count
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function buildHand(side: Side, color: number, tex: THREE.Texture): Hand {
  const mirror = side === 'left' ? -1 : 1
  const root = new THREE.Group()
  const wrist = new THREE.Group()
