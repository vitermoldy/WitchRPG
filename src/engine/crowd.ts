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
