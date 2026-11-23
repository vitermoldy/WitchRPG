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
  palmDown: number
  tremble: number
  glow: number
}

const POSES: Record<PoseName, Pose> = {
  idle: { curl: 0.38, spread: 0.08, reach: 0, lift: 0, twist: 0, palmDown: 0, tremble: 0, glow: 0.35 },
