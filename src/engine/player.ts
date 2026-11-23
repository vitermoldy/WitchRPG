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
    // Look.
    const sens = CAMERA.sensitivity * sensitivity
    this.yaw -= input.dx * sens
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - input.dy * sens))
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    const k = (c: string) => (canAct && input.held(c) ? 1 : 0)
    const fwd = k('KeyW') - k('KeyS')
    const str = k('KeyD') - k('KeyA')
    const wish = new THREE.Vector3().addScaledVector(this.forward, fwd).addScaledVector(this.right, str)
    const moving = wish.lengthSq() > 0
    if (moving) wish.normalize()

    const crouchHeld = canAct && input.held('KeyC')
    this.sprinting = canAct && input.held('ShiftLeft') && fwd > 0 && !this.crouching && this.sliding <= 0
    if (canAct && input.pressed('KeyC') && this.onGround && this.sprinting) {
      this.sliding = MOVE.slideTime
      const boost = MOVE.sprint * this.speedMult * MOVE.slideBoost
      this.vel.x = this.forward.x * boost
      this.vel.z = this.forward.z * boost
    }
    this.crouching = crouchHeld && this.sliding <= 0

    let target: number = MOVE.walk
    if (this.sprinting) target = MOVE.sprint
    if (this.crouching) target = MOVE.crouch
    target *= this.speedMult

    if (this.sliding > 0) {
      this.sliding -= dt
      const damp = Math.exp(-1.6 * dt)
      this.vel.x *= damp
      this.vel.z *= damp
      if (!this.onGround) this.sliding = 0
    } else {
      const accel = this.onGround ? MOVE.groundAccel : MOVE.airAccel
      const desiredX = wish.x * target
      const desiredZ = wish.z * target
      const dx = desiredX - this.vel.x
      const dz = desiredZ - this.vel.z
      const len = Math.hypot(dx, dz)
      const maxStep = accel * dt
      if (len > maxStep && len > 1e-6) {
        this.vel.x += (dx / len) * maxStep
        this.vel.z += (dz / len) * maxStep
      } else {
        this.vel.x = desiredX
        this.vel.z = desiredZ
      }
    }

    // Jump and Crimson Float.
    const space = canAct && input.held('Space')
    if (canAct && input.pressed('Space') && this.onGround) {
      this.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight)
      this.onGround = false
