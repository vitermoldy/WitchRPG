import * as THREE from 'three'
import { COLOR } from './palette'
import { Particles, glowTexture } from './fx'

export type Side = 'left' | 'right'
export type PoseName = 'idle' | 'cast' | 'grip' | 'push' | 'rite' | 'command' | 'block' | 'lowered'

interface Pose {
  curl: number
  spread: number
  reach: number
  lift: number
  twist: number
