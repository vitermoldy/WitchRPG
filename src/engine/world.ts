import * as THREE from 'three'
import { Colliders, type Box } from './collide'
import { WORLD } from '../game/balance'

export interface PropSpot {
  kind: 'car' | 'crate'
  x: number
  z: number
  yaw: number
  stack?: number
}

export interface WorldBuild {
  colliders: Colliders
  portals: THREE.Vector3[]
  playerStart: THREE.Vector3
  props: PropSpot[]
  breakables: Box[]
  update: (t: number) => void
  keyLight: THREE.DirectionalLight
  riftDir: THREE.Vector3
}

function rand(seed: number) {
