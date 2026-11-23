import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Colliders } from '../src/engine/collide'
import { Player } from '../src/engine/player'
import type { Input } from '../src/engine/input'

// Only the parts of Input that Player.update reads.
const idle = { dx: 0, dy: 0, held: () => false, pressed: () => false } as unknown as Input

const finite = (p: Player) => [p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z].every(Number.isFinite)

describe('Player.update', () => {
  it('stays finite when standing still with a negative frame time (the black-screen bug)', () => {
    const p = new Player()
    p.reset(new THREE.Vector3(0, 0, 14), 0)
    p.update(-0.0014, idle, new Colliders(), 1, [], true)
    expect(finite(p)).toBe(true)
    expect(p.pos.z).toBeCloseTo(14)
  })

  it('stays finite with a zero frame time', () => {
    const p = new Player()
