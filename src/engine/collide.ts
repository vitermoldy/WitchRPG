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
    b.alive = false
    this.boxes = this.boxes.filter((x) => x !== b)
  }

  /**
   * Pushes a circle out of every box that blocks it. A box blocks when its top is above
   * feetY + step; lower boxes are walked onto instead. Returns true on any contact.
   */
  pushCircle(pos: THREE.Vector3, r: number, feetY: number, step: number, outNormal?: THREE.Vector3): boolean {
    let hit = false
    for (const b of this.boxes) {
      if (b.top <= feetY + step) continue
      const cx = Math.min(b.maxX, Math.max(b.minX, pos.x))
      const cz = Math.min(b.maxZ, Math.max(b.minZ, pos.z))
      let dx = pos.x - cx
      let dz = pos.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
