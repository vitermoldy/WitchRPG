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
export class Player {
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = true
  crouching = false
