import * as THREE from 'three'
import type { UnitKind } from '../game/balance'
import { COLOR } from './palette'

export type Team = 'rift' | 'shadow'

export interface UnitModel {
  root: THREE.Group
  body: THREE.Group
  parts: Record<string, THREE.Object3D>
  bodyMat: THREE.MeshStandardMaterial
  eyeMat: THREE.MeshStandardMaterial
  meshes: THREE.Mesh[]
}

const shared = {
  rift: {
    accent: new THREE.MeshStandardMaterial({ color: 0x120806, emissive: COLOR.rift, emissiveIntensity: 1.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COLOR.rift, emissiveIntensity: 3 }),
    bone: new THREE.MeshStandardMaterial({ color: 0x8a7d70, roughness: 0.7, flatShading: true }),
  },
  shadow: {
    accent: new THREE.MeshStandardMaterial({ color: 0x080410, emissive: COLOR.umbra, emissiveIntensity: 1.8 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COLOR.umbraHot, emissiveIntensity: 3.4 }),
    bone: new THREE.MeshStandardMaterial({ color: 0x2a1848, roughness: 0.6, flatShading: true, emissive: COLOR.umbraDeep, emissiveIntensity: 0.6 }),
  },
}

function bodyMaterial(team: Team) {
  return team === 'rift'
    ? new THREE.MeshStandardMaterial({ color: 0x7a6e6c, roughness: 0.8, flatShading: true, emissive: 0x000000 })
    : new THREE.MeshStandardMaterial({ color: 0x150c24, roughness: 0.5, flatShading: true, emissive: COLOR.umbraDeep, emissiveIntensity: 0.55 })
}

function box(w: number, h: number, d: number, mat: THREE.Material, meshes: THREE.Mesh[], y = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.y = y
  m.castShadow = true
  meshes.push(m)
  return m
}

function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

/** A hunched, long-armed ash body with an amber crack down the chest. */
function husk(team: Team): UnitModel {
  const meshes: THREE.Mesh[] = []
  const bodyMat = bodyMaterial(team)
  const s = shared[team]
  const root = new THREE.Group()
  const body = pivot(root, 0, 0.95, 0)
  const parts: Record<string, THREE.Object3D> = {}
  body.add(box(0.36, 0.2, 0.24, bodyMat, meshes))
  const spine = pivot(body, 0, 0.08, 0)
  spine.rotation.x = 0.42
  parts.spine = spine
  const torso = box(0.46, 0.56, 0.3, bodyMat, meshes, 0.3)
  spine.add(torso)
  const crack = box(0.07, 0.44, 0.02, s.accent, meshes, 0.32)
  crack.position.z = -0.155
  crack.castShadow = false
  spine.add(crack)
  for (const x of [-0.14, 0.14]) {
    const rib = box(0.12, 0.03, 0.02, s.bone, meshes, 0.3)
    rib.position.set(x, 0.36, -0.155)
    spine.add(rib)
  }
  const head = pivot(spine, 0, 0.62, -0.06)
  parts.head = head
  head.add(box(0.24, 0.27, 0.26, bodyMat, meshes, 0.1))
  const jaw = pivot(head, 0, -0.02, -0.02)
  jaw.add(box(0.2, 0.06, 0.2, s.bone, meshes, -0.03))
  parts.jaw = jaw
  for (const x of [-0.06, 0.06]) {
    const eye = box(0.06, 0.03, 0.02, s.eye, meshes, 0.13)
    eye.position.set(x, 0.13, -0.135)
    eye.castShadow = false
    head.add(eye)
  }
  for (const side of [-1, 1]) {
    const sh = pivot(spine, side * 0.3, 0.52, 0)
    sh.add(box(0.12, 0.44, 0.12, bodyMat, meshes, -0.2))
    const el = pivot(sh, 0, -0.42, 0)
    el.add(box(0.1, 0.46, 0.1, bodyMat, meshes, -0.22))
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 4), s.bone)
      claw.position.set(c * 0.03, -0.5, -0.02)
      claw.rotation.x = Math.PI
      el.add(claw)
      meshes.push(claw)
    }
    parts[side < 0 ? 'armL' : 'armR'] = sh
    parts[side < 0 ? 'foreL' : 'foreR'] = el
    const hip = pivot(body, side * 0.12, -0.05, 0)
    hip.add(box(0.14, 0.46, 0.15, bodyMat, meshes, -0.22))
    const knee = pivot(hip, 0, -0.45, 0)
    knee.add(box(0.12, 0.44, 0.13, bodyMat, meshes, -0.22))
    const foot = box(0.13, 0.06, 0.24, s.bone, meshes, -0.44)
    foot.position.z = -0.05
    knee.add(foot)
    parts[side < 0 ? 'legL' : 'legR'] = hip
    parts[side < 0 ? 'kneeL' : 'kneeR'] = knee
  }
  return { root, body, parts, bodyMat, eyeMat: s.eye, meshes }
}

/** Low, fast, many-eyed, with a ridge of bone spikes. */
function hound(team: Team): UnitModel {
  const meshes: THREE.Mesh[] = []
  const bodyMat = bodyMaterial(team)
  const s = shared[team]
  const root = new THREE.Group()
  const body = pivot(root, 0, 0.72, 0)
  const parts: Record<string, THREE.Object3D> = {}
  const torso = box(0.5, 0.42, 1.05, bodyMat, meshes)
  body.add(torso)
  const chest = box(0.56, 0.48, 0.4, bodyMat, meshes, 0.03)
  chest.position.z = -0.36
  body.add(chest)
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 - i * 0.02, 4), s.bone)
    spike.position.set(0, 0.28, -0.35 + i * 0.18)
    spike.rotation.x = 0.5
    body.add(spike)
    meshes.push(spike)
  }
  const glowLine = box(0.04, 0.03, 0.9, s.accent, meshes, 0.215)
  glowLine.castShadow = false
  body.add(glowLine)
  const neck = pivot(body, 0, 0.08, -0.58)
  parts.head = neck
  neck.add(box(0.32, 0.28, 0.44, bodyMat, meshes, 0))
  neck.children[0].position.z = -0.16
  const jaw = pivot(neck, 0, -0.1, -0.05)
  const jm = box(0.26, 0.08, 0.38, s.bone, meshes, -0.03)
  jm.position.z = -0.16
  jaw.add(jm)
  parts.jaw = jaw
  for (const [x, y] of [[-0.09, 0.06], [0.09, 0.06], [-0.05, 0.11], [0.05, 0.11]] as const) {
    const eye = box(0.035, 0.03, 0.02, s.eye, meshes)
    eye.position.set(x, y, -0.385)
    eye.castShadow = false
    neck.add(eye)
  }
  const legs: [string, number, number][] = [
    ['legFL', -0.22, -0.4],
    ['legFR', 0.22, -0.4],
    ['legBL', -0.2, 0.38],
    ['legBR', 0.2, 0.38],
  ]
  for (const [name, x, z] of legs) {
    const hip = pivot(body, x, -0.12, z)
    hip.add(box(0.11, 0.36, 0.13, bodyMat, meshes, -0.16))
    const knee = pivot(hip, 0, -0.34, 0)
    knee.add(box(0.08, 0.3, 0.09, bodyMat, meshes, -0.14))
    hip.userData.knee = knee
    parts[name] = hip
  }
  const tail = pivot(body, 0, 0.08, 0.52)
  let seg: THREE.Object3D = tail
  for (let i = 0; i < 3; i++) {
    const t = box(0.07 - i * 0.015, 0.07 - i * 0.015, 0.22, i === 2 ? s.accent : bodyMat, meshes)
    t.position.z = 0.11
    seg.add(t)
    const next = pivot(seg, 0, 0, 0.22)
    seg = next
  }
  parts.tail = tail
  return { root, body, parts, bodyMat, eyeMat: s.eye, meshes }
}

interface BipedSize {
  hip: number
  pelvis: [number, number, number]
  torso: [number, number, number]
  lean: number
  head: [number, number, number]
  shoulderX: number
  arm: [number, number, number]
  hipX: number
  leg: [number, number, number]
}

type Mats = (typeof shared)['rift'] & { body: THREE.MeshStandardMaterial }

/**
 * A standing body with the same joints as the husk (spine, head, jaw, arms, forearms, legs, knees),
 * so one walk and strike animation fits every humanoid creature. `dress` adds what makes each one.
 */
function biped(team: Team, z: BipedSize, dress: (p: Record<string, THREE.Object3D>, m: Mats, meshes: THREE.Mesh[]) => void): UnitModel {
  const meshes: THREE.Mesh[] = []
  const bodyMat = bodyMaterial(team)
  const s = shared[team]
  const mats: Mats = { ...s, body: bodyMat }
  const root = new THREE.Group()
  const body = pivot(root, 0, z.hip, 0)
  const parts: Record<string, THREE.Object3D> = {}
  body.add(box(z.pelvis[0], z.pelvis[1], z.pelvis[2], bodyMat, meshes))
  const spine = pivot(body, 0, z.pelvis[1] * 0.4, 0)
  spine.rotation.x = z.lean
  spine.userData.lean = z.lean
  parts.spine = spine
  spine.add(box(z.torso[0], z.torso[1], z.torso[2], bodyMat, meshes, z.torso[1] / 2))
  const head = pivot(spine, 0, z.torso[1] + 0.02, -z.torso[2] * 0.15)
  parts.head = head
  head.add(box(z.head[0], z.head[1], z.head[2], bodyMat, meshes, z.head[1] / 2))
  const jaw = pivot(head, 0, 0.02, -0.02)
  parts.jaw = jaw
  for (const side of [-1, 1]) {
    const sh = pivot(spine, side * z.shoulderX, z.torso[1] * 0.92, 0)
    sh.add(box(z.arm[0], z.arm[1], z.arm[0], bodyMat, meshes, -z.arm[1] / 2))
    const el = pivot(sh, 0, -z.arm[1], 0)
    el.add(box(z.arm[0] * 0.85, z.arm[2], z.arm[0] * 0.85, bodyMat, meshes, -z.arm[2] / 2))
    parts[side < 0 ? 'armL' : 'armR'] = sh
    parts[side < 0 ? 'foreL' : 'foreR'] = el
    const hip = pivot(body, side * z.hipX, -z.pelvis[1] * 0.3, 0)
    hip.add(box(z.leg[0], z.leg[1], z.leg[0] * 1.05, bodyMat, meshes, -z.leg[1] / 2))
    const knee = pivot(hip, 0, -z.leg[1], 0)
    knee.add(box(z.leg[0] * 0.9, z.leg[2], z.leg[0] * 0.95, bodyMat, meshes, -z.leg[2] / 2))
    const foot = box(z.leg[0] * 0.95, z.leg[0] * 0.4, z.leg[0] * 1.8, s.bone, meshes, -z.leg[2])
    foot.position.z = -z.leg[0] * 0.35
    knee.add(foot)
    parts[side < 0 ? 'legL' : 'legR'] = hip
    parts[side < 0 ? 'kneeL' : 'kneeR'] = knee
  }
  dress(parts, mats, meshes)
  return { root, body, parts, bodyMat, eyeMat: s.eye, meshes }
}

function eyes(head: THREE.Object3D, m: Mats, meshes: THREE.Mesh[], spots: [number, number][], size: [number, number], z: number) {
  for (const [x, y] of spots) {
    const e = box(size[0], size[1], 0.02, m.eye, meshes, y)
    e.position.set(x, y, z)
    e.castShadow = false
    head.add(e)
  }
}

/** Crouched and bloated; the amber throat sac is what it spits from. */
function spitter(team: Team): UnitModel {
  return biped(
    team,
    { hip: 0.62, pelvis: [0.4, 0.2, 0.3], torso: [0.5, 0.48, 0.46], lean: 0.8, head: [0.3, 0.22, 0.36], shoulderX: 0.28, arm: [0.08, 0.3, 0.3], hipX: 0.14, leg: [0.12, 0.33, 0.32] },
    (p, m, meshes) => {
      const sac = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), m.accent)
      sac.position.set(0, -0.02, -0.16)
      sac.scale.set(1, 0.8, 1.1)
      p.head.add(sac)
      meshes.push(sac)
      p.sac = sac
      const jaw = box(0.26, 0.06, 0.3, m.bone, meshes, -0.02)
      jaw.position.z = -0.06
      p.jaw.add(jaw)
      eyes(p.head, m, meshes, [[-0.08, 0.15], [0.08, 0.15], [0, 0.18]], [0.04, 0.03], -0.182)
      for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), m.bone)
        spike.position.set(0, 0.5, 0.05 + i * 0.12)
        spike.rotation.x = 0.6
        p.spine.add(spike)
        meshes.push(spike)
      }
    },
  )
}

/** Armoured, slow, with a tower shield held in front: bolts break on it. */
function warden(team: Team): UnitModel {
  return biped(
    team,
    { hip: 1.08, pelvis: [0.5, 0.26, 0.32], torso: [0.72, 0.78, 0.44], lean: 0.08, head: [0.3, 0.34, 0.32], shoulderX: 0.46, arm: [0.17, 0.46, 0.48], hipX: 0.17, leg: [0.2, 0.52, 0.52] },
    (p, m, meshes) => {
      for (const side of [-1, 1]) {
        const pad = box(0.34, 0.16, 0.42, m.bone, meshes, 0.84)
        pad.position.x = side * 0.42
        pad.rotation.z = side * -0.25
        p.spine.add(pad)
      }
      const visor = box(0.24, 0.035, 0.02, m.eye, meshes, 0.2)
      visor.position.z = -0.17
      visor.castShadow = false
      p.head.add(visor)
      const crest = box(0.05, 0.12, 0.3, m.bone, meshes, 0.39)
      p.head.add(crest)
      const shield = box(0.1, 1.35, 0.9, m.bone, meshes, -0.25)
      shield.position.set(0.05, -0.3, -0.32)
      shield.rotation.y = Math.PI / 2
      p.foreL.add(shield)
      const rim = box(0.04, 1.2, 0.05, m.accent, meshes, -0.25)
      rim.position.set(0.05, -0.3, -0.38)
      rim.castShadow = false
      p.foreL.add(rim)
      p.shield = shield
      const mace = box(0.26, 0.3, 0.26, m.bone, meshes, -0.55)
      p.foreR.add(mace)
    },
  )
}

/** Tall, crowned with horns, a burning core in the chest. It calls husks to its side. */
export function buildModel(kind: UnitKind, team: Team): UnitModel {
  return kind === 'husk' ? husk(team) : hound(team)
}

export function disposeModel(m: UnitModel) {
  for (const mesh of m.meshes) mesh.geometry.dispose()
  m.bodyMat.dispose()
}
