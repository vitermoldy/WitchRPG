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
  portals: THREE.Vector3[]
  playerStart: THREE.Vector3
  props: PropSpot[]
  breakables: Box[]
  update: (t: number) => void
  keyLight: THREE.DirectionalLight
  riftDir: THREE.Vector3
}

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

/** Asphalt with two crossing roads, sidewalks, cracks and the glowing rift fractures. */
function groundTextures(size: number, half: number, cracksAt: THREE.Vector3[]) {
