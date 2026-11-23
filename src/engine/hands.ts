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
  root.add(wrist)
  const skin = skinMat()
  const cloth = new THREE.MeshStandardMaterial({ color: COLOR.cloth, roughness: 0.85 })
  const cuff = new THREE.MeshStandardMaterial({ color: 0x1a0d12, emissive: color, emissiveIntensity: 0.6, roughness: 0.5 })
  const nail = new THREE.MeshStandardMaterial({ color: 0x120c0f, roughness: 0.25, metalness: 0.6 })
  const sigil = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1.2 })

  // Forearm and sleeve, running back toward the camera.
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.05, 0.42, 10), skin)
  arm.position.set(0, -0.2, 0.06)
  arm.rotation.x = 0.32
  root.add(arm)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.3, 12, 1, true), cloth)
  sleeve.material.side = THREE.DoubleSide
  sleeve.position.set(0, -0.31, 0.1)
  sleeve.rotation.x = 0.32
  root.add(sleeve)
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 20), cuff)
  trim.position.set(0, -0.165, 0.048)
  trim.rotation.x = Math.PI / 2 + 0.32
  root.add(trim)

  // Palm: faces forward (-Z); the player sees the back of the hand and its sigil.
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.092, 0.03), skin)
  palm.position.set(0, 0.046, 0)
  wrist.add(palm)
  const mark = new THREE.Mesh(sigilShape(), sigil)
  mark.position.set(0, 0.048, 0.0162)
  wrist.add(mark)

  const fingers: Finger[] = []
  const lengths = [0.95, 1, 0.94, 0.78]
  const xs = [-0.029, -0.0095, 0.0095, 0.028]
  const segs = [0.04, 0.028, 0.022]
  for (let f = 0; f < 4; f++) {
    const joints: THREE.Object3D[] = []
    let parent: THREE.Object3D = wrist
    let y = 0.092
    for (let s = 0; s < 3; s++) {
      const j = new THREE.Group()
      j.position.set(s === 0 ? xs[f] : 0, y, 0)
      parent.add(j)
      const len = segs[s] * lengths[f]
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0092 - s * 0.0008, len, 3, 8), skin)
      seg.position.y = len / 2
      j.add(seg)
      if (s === 2) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0075, 0.016, 6), nail)
        tip.position.set(0, len + 0.004, -0.002)
        j.add(tip)
      }
      joints.push(j)
      parent = j
      y = len
    }
    fingers.push({ joints, baseSpread: (f - 1.5) * 0.09 })
  }
  // Thumb on the inner edge.
  const thumb: THREE.Object3D[] = []
  {
    let parent: THREE.Object3D = wrist
    const t0 = new THREE.Group()
    t0.position.set(-0.042, 0.022, -0.004)
    t0.rotation.set(-0.3, 0, 0.5)
    parent.add(t0)
    parent = t0
    for (let s = 0; s < 2; s++) {
      const j = s === 0 ? t0 : new THREE.Group()
      if (s > 0) {
        j.position.y = 0.032
        parent.add(j)
      }
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.03, 3, 8), skin)
      seg.position.y = 0.016
      j.add(seg)
      thumb.push(j)
      parent = j
    }
  }

  const orb = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  )
  orb.position.set(0, 0.1, -0.09)
  orb.scale.setScalar(0.08)
  wrist.add(orb)
  const light = new THREE.PointLight(color, 0.02, 0.6, 2)
  light.position.set(0, 0.07, -0.16)
  wrist.add(light)

  const base = new THREE.Vector3(0.235 * mirror, -0.235, -0.5)
  const baseRot = new THREE.Euler(-0.5, -0.3 * mirror, 0.5 * mirror)
  root.position.copy(base)
  root.rotation.copy(baseRot)
  root.scale.set(mirror * 0.86, 0.86, 0.86)
  return {
    side,
    root,
    wrist,
    fingers,
    thumb,
    orb,
    light,
    sigil,
    cuff,
    base,
    baseRot,
    pose: { ...POSES.idle },
    target: 'idle',
    hold: 0,
    kick: 0,
    flash: 0,
    color: new THREE.Color(color),
    overloadColor: new THREE.Color(COLOR.chaos),
  }
}

/** The two hands, drawn in their own scene after the world so walls never cut through them. */
export class Hands {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10)
  readonly particles = new Particles(500, 'glow')
  private readonly left: Hand
  private readonly right: Hand
  private t = 0
  private swayX = 0
  private swayY = 0
  overload = false
  private readonly tmp = new THREE.Vector3()

  constructor() {
    const tex = glowTexture()
    this.left = buildHand('left', COLOR.chaos, tex)
    this.right = buildHand('right', COLOR.umbra, tex)
    this.scene.add(this.left.root, this.right.root, this.camera)
    this.scene.add(new THREE.AmbientLight(0x4a3a44, 1.2))
    const rim = new THREE.DirectionalLight(0xffd8cc, 2.2)
    rim.position.set(0.2, 1, -0.5)
    this.scene.add(rim)
    const back = new THREE.DirectionalLight(0xff6a70, 0.7)
    back.position.set(-0.4, 0.3, 1)
    this.scene.add(back)
    const fill = new THREE.DirectionalLight(0xc8b8ff, 0.6)
    fill.position.set(0, -0.3, 1)
    this.scene.add(fill)
    this.scene.add(this.particles.points)
  }

  private hand(side: Side) {
    return side === 'left' ? this.left : this.right
  }

