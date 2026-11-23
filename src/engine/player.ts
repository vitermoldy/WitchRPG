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
  readonly forward = new THREE.Vector3()
  readonly right = new THREE.Vector3()

  reset(at: THREE.Vector3, yaw: number) {
    this.pos.copy(at)
    this.lastGood.copy(at)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = 0
    this.onGround = true
    this.sliding = 0
    this.floating = false
    this.stamina = MOVE.staminaMax
    this.floatLeft = this.floatMax
    this.trauma = 0
    this.alive = true
  }

  addTrauma(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  update(dt: number, input: Input, world: Colliders, sensitivity: number, blockers: Circle[], canAct: boolean) {
