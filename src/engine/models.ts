import * as THREE from 'three'
import type { UnitKind } from '../game/balance'
import { COLOR } from './palette'

export type Team = 'rift' | 'shadow'

export interface UnitModel {
  root: THREE.Group
  body: THREE.Group
  parts: Record<string, THREE.Object3D>
  bodyMat: THREE.MeshStandardMaterial
