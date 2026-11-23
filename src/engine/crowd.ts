import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { UnitKind } from '../game/balance'
import { buildModel } from './models'
import type { Unit } from './units'

interface Batch {
  mesh: THREE.InstancedMesh
