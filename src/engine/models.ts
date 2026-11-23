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
