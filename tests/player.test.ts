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
