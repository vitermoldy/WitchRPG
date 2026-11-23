import * as THREE from 'three'
import { Colliders, type Box } from './collide'
import { COLOR } from './palette'

/**
 * Jantung Rift, where The Hollow Warden waits at the end of Tier III.
 * Phase 1: a stone disc with raised slabs. Phase 2: the disc falls away and the slabs turn out to be
 * pillars over a void; the witch floats between them. Phase 3 keeps the pillars.
 */
export interface Platform {
  box: Box
  center: THREE.Vector3
  size: number
}

export interface LairBuild {
  group: THREE.Group
  colliders: Colliders
  platforms: Platform[]
  /** Where the witch steps in, on an outer pillar facing the middle. */
  playerStart: THREE.Vector3
  /** Rocks the witch can throw at the boss's shell in phase 2. */
  rockSpots: THREE.Vector3[]
  setFloor(solid: boolean): void
  /** The top of the pillar nearest to a point: where someone who fell comes back. */
  nearestTop(at: THREE.Vector3): THREE.Vector3
  update(t: number): void
}

function crackTexture(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const e = document.createElement('canvas')
  e.width = e.height = size
  const eg = e.getContext('2d')!
  g.fillStyle = '#1c1719'
  g.fillRect(0, 0, size, size)
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, size, size)
  let seed = 41
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < size * 6; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,240,230,0.04)'
    g.fillRect(R() * size, R() * size, 2, 2)
  }
  // Rings of carved stone and the cracks that will open in phase 2.
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  for (const r of [0.18, 0.34, 0.48]) {
    g.lineWidth = 3
    g.beginPath()
    g.arc(size / 2, size / 2, r * size, 0, Math.PI * 2)
    g.stroke()
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.2
    let x = size / 2 + Math.cos(a) * size * 0.06
    let y = size / 2 + Math.sin(a) * size * 0.06
    let ang = a
    eg.strokeStyle = 'rgba(255,120,60,0.9)'
    eg.lineWidth = 2
    g.lineWidth = 3
    eg.beginPath()
    g.beginPath()
    eg.moveTo(x, y)
    g.moveTo(x, y)
    for (let k = 0; k < 26; k++) {
      ang += (R() - 0.5) * 0.6
