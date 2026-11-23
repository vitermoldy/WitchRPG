import * as THREE from 'three'
import { CAMERA, MOVE } from '../game/balance'
import type { Colliders } from './collide'
import type { Input } from './input'

export interface Circle {
  pos: THREE.Vector3
  radius: number
  top: number
}

/** The witch's body: movement, Crimson Float, slide, camera, bob and shake. */
