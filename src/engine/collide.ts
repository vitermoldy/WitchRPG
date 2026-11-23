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
  boxes: Box[] = []

  add(cx: number, cz: number, w: number, d: number, top: number, extra: Partial<Box> = {}): Box {
    const b: Box = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top, alive: true, ...extra }
    this.boxes.push(b)
    return b
  }

  remove(b: Box) {
