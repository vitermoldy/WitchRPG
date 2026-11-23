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
