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
