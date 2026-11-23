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
      hit = true
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        dx /= d
        dz /= d
        pos.x = cx + dx * r
        pos.z = cz + dz * r
        outNormal?.set(dx, 0, dz)
      } else {
        // Centre inside the box: leave along the shortest axis.
        const pen = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z]
        const m = pen.indexOf(Math.min(...pen))
        if (m === 0) pos.x = b.minX - r
        else if (m === 1) pos.x = b.maxX + r
        else if (m === 2) pos.z = b.minZ - r
        else pos.z = b.maxZ + r
        outNormal?.set(m === 0 ? -1 : m === 1 ? 1 : 0, 0, m === 2 ? -1 : m === 3 ? 1 : 0)
      }
    }
    return hit
  }

  /** Height of the floor under a circle: the highest box top within reach, or 0. */
  groundAt(x: number, z: number, r: number, feetY: number, step: number): number {
    let g = 0
    for (const b of this.boxes) {
      if (b.top > feetY + step || b.top <= g) continue
      if (x + r * 0.6 < b.minX || x - r * 0.6 > b.maxX || z + r * 0.6 < b.minZ || z - r * 0.6 > b.maxZ) continue
      g = b.top
    }
    return g
  }

  /** Ray against boxes and the ground plane. */
  raycast(o: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    let best: RayHit | null = null
    if (dir.y < -1e-6) {
      const t = -o.y / dir.y
      if (t > 0 && t < maxDist) best = { dist: t, point: o.clone().addScaledVector(dir, t), normal: new THREE.Vector3(0, 1, 0), box: null }
    }
    for (const b of this.boxes) {
      const t = rayBox(o, dir, b, best ? best.dist : maxDist)
      if (t === null) continue
      const point = o.clone().addScaledVector(dir, t.t)
