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
