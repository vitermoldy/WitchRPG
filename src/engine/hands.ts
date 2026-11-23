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
  cast: { curl: 0.12, spread: 0.35, reach: 0.06, lift: 0.04, twist: 0.1, palmDown: 0, tremble: 0, glow: 0.9 },
  grip: { curl: 0.62, spread: 0.5, reach: 0.13, lift: 0.08, twist: 0.25, palmDown: -0.1, tremble: 1, glow: 1.25 },
  push: { curl: 0, spread: 0.55, reach: 0.17, lift: 0.06, twist: 0.15, palmDown: 0, tremble: 0.2, glow: 1.7 },
