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
