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
  const R = rand(7)
  const { c, g } = canvas(size, size)
  const { c: ec, g: eg } = canvas(size, size)
  const px = (m: number) => ((m + half) / (half * 2)) * size
  g.fillStyle = '#2a2527'
  g.fillRect(0, 0, size, size)
  // Roads.
  const road = 6.5
  g.fillStyle = '#1a1617'
  g.fillRect(px(-road), 0, px(road) - px(-road), size)
  g.fillRect(0, px(-road), size, px(road) - px(-road))
  // Plaza disc in the middle.
  g.beginPath()
  g.arc(px(0), px(0), (size / (half * 2)) * 11, 0, Math.PI * 2)
  g.fillStyle = '#242022'
  g.fill()
  // Paving joints on the sidewalks.
  g.strokeStyle = 'rgba(0,0,0,0.22)'
  g.lineWidth = 1
  for (let m = -half; m <= half; m += 2.5) {
    g.beginPath()
    g.moveTo(px(m), 0)
    g.lineTo(px(m), size)
    g.stroke()
    g.beginPath()
    g.moveTo(0, px(m))
    g.lineTo(size, px(m))
    g.stroke()
  }
  g.fillStyle = '#1a1617'
  g.fillRect(px(-road), 0, px(road) - px(-road), size)
  g.fillRect(0, px(-road), size, px(road) - px(-road))
  // Lane dashes, worn.
  g.fillStyle = 'rgba(190,180,170,0.28)'
  for (let m = -half; m < half; m += 4) {
    if (Math.abs(m) < 12) continue
    g.fillRect(px(-0.12), px(m), px(0.12) - px(-0.12), px(m + 2) - px(m))
    g.fillRect(px(m), px(-0.12), px(m + 2) - px(m), px(0.12) - px(-0.12))
  }
  // Curbs.
  g.fillStyle = '#39332f'
  for (const s of [-1, 1]) {
    g.fillRect(px(s * road) - 2, 0, 4, size)
    g.fillRect(0, px(s * road) - 2, size, 4)
  }
  // Grain.
  for (let i = 0; i < size * size * 0.05; i++) {
    const v = R()
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,230,0.035)'
    g.fillRect(R() * size, R() * size, 1 + R() * 2, 1 + R() * 2)
