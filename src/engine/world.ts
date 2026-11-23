import * as THREE from 'three'
import { Colliders, type Box } from './collide'
import { WORLD } from '../game/balance'

export interface PropSpot {
  kind: 'car' | 'crate'
  x: number
