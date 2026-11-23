import * as THREE from 'three'

export interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  top: number
  /** Thin cover that Chaos Burst knocks down. */
  breakable?: boolean
  mesh?: THREE.Object3D
  alive: boolean
}

export interface RayHit {
  dist: number
  point: THREE.Vector3
  normal: THREE.Vector3
  box: Box | null
}

/** Static world: axis-aligned boxes standing on the ground at y = 0. */
export class Colliders {
