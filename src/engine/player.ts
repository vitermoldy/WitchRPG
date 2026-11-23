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
  sliding = 0
  floating = false
  sprinting = false
  stamina: number = MOVE.staminaMax
  floatLeft: number = MOVE.floatMax
  private staminaDelay = 0
  private eye: number = MOVE.eye
  private bob = 0
  private bobAmount = 0
  private trauma = 0
  private shakeT = 0
  private fov: number = CAMERA.fov
  private landKick = 0
  readonly radius = MOVE.radius
  readonly height = 1.75

  hp = 150
  maxHp = 150
  mana = 125
  maxMana = 125
  hurtTimer = 0
  alive = true

  // Tuned from stats each Rift.
  speedMult = 1
  floatMax: number = MOVE.floatMax

  private readonly lastGood = new THREE.Vector3()
