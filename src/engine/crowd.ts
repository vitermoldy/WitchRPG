import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { UnitKind } from '../game/balance'
import { buildModel } from './models'
import type { Unit } from './units'

interface Batch {
  mesh: THREE.InstancedMesh
  geo: THREE.BufferGeometry
  mats: THREE.Material[]
  cap: number
  used: number
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * The far part of a shadow army. Each kind is one merged, standing model drawn as an InstancedMesh with
 * one draw per material, placed by position, facing and scale. Rising and sinking still play, by moving
 * the instance into and out of the ground. The nearest shadows keep their own animated models.
 */
export class ShadowCrowd {
  readonly group = new THREE.Group()
  private readonly batches = new Map<UnitKind, Batch>()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor() {
    this.group.name = 'shadow-crowd'
  }

  /** One standing shadow of this kind, merged by material so it draws in a handful of calls. */
  private build(kind: UnitKind): Batch {
    const model = buildModel(kind, 'shadow')
    model.root.updateMatrixWorld(true)
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const mesh of model.meshes) {
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      // Only what the materials read; built-in shapes do not all agree on the rest.
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
      const mat = mesh.material as THREE.Material
      const list = byMat.get(mat)
      if (list) list.push(g)
      else byMat.set(mat, [g])
    }
    const mats = [...byMat.keys()]
    const parts = mats.map((mat) => mergeGeometries(byMat.get(mat)!, false)!)
    const geo = mergeGeometries(parts, true)!
    const batch: Batch = { mesh: this.makeMesh(geo, mats, 64), geo, mats, cap: 64, used: 0 }
    this.batches.set(kind, batch)
    return batch
  }

  private makeMesh(geo: THREE.BufferGeometry, mats: THREE.Material[], cap: number) {
    const mesh = new THREE.InstancedMesh(geo, mats, cap)
    mesh.count = 0
    // Instances spread over the whole map; the merged model's own bounds would cull them wrongly.
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(mesh)
    return mesh
  }

  private batch(kind: UnitKind, need: number): Batch {
    const b = this.batches.get(kind) ?? this.build(kind)
    if (need > b.cap) {
      let cap = b.cap
      while (cap < need) cap *= 2
      this.group.remove(b.mesh)
      b.mesh.dispose()
      b.mesh = this.makeMesh(b.geo, b.mats, cap)
      b.cap = cap
    }
    return b
  }

  /** Builds every kind now, so the first big call does not stall on it. */
  prepare(kinds: UnitKind[]) {
    for (const k of kinds) this.batch(k, 1)
  }

  update(units: Unit[], t: number) {
    const counts = new Map<UnitKind, number>()
    for (const u of units) if (u.team === 'shadow' && !u.detailed && u.state !== 'dead') counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1)
    for (const [kind, b] of this.batches) {
      b.used = 0
      if (!counts.has(kind)) b.mesh.count = 0
    }
    for (const [kind, n] of counts) this.batch(kind, n).used = 0
    for (const u of units) {
      if (u.team !== 'shadow' || u.detailed || u.state === 'dead') continue
      const b = this.batches.get(u.kind)!
      this.p.copy(u.pos)
      if (u.state === 'rising') {
        const k = Math.min(1, u.t / 1.2)
        this.p.y -= (1 - k) * (1 - k) * u.spec.height
      } else if (u.state === 'sinking') {
        const k = Math.min(1, u.t / 0.8)
        this.p.y -= k * k * u.spec.height
      } else {
        // A small step bob while it moves, so a marching crowd does not look frozen.
