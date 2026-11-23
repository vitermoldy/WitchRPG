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
  }
  // Ordinary cracks.
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  for (let i = 0; i < 70; i++) {
    let x = R() * size
    let y = R() * size
    let a = R() * Math.PI * 2
    g.lineWidth = 1 + R() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 12; k++) {
      a += (R() - 0.5) * 1.2
      x += Math.cos(a) * 9
      y += Math.sin(a) * 9
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // Rift fractures: emissive map only, so they glow without lighting.
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, size, size)
  for (const at of cracksAt) {
    for (let i = 0; i < 9; i++) {
      const x = px(at.x)
      const y = px(at.z)
      const a = (i / 9) * Math.PI * 2 + R() * 0.5
      const len = 10 + R() * 18
      for (const pass of [0, 1]) {
        eg.strokeStyle = pass === 0 ? 'rgba(255,40,60,0.22)' : 'rgba(255,110,100,0.85)'
        g.strokeStyle = 'rgba(0,0,0,0.8)'
        eg.lineWidth = pass === 0 ? 5 : 1.5
        g.lineWidth = 3
        let cx = x
        let cy = y
        let ca = a
        const R2 = rand(i * 31 + Math.round(at.x * 7 + at.z * 13))
        eg.beginPath()
        g.beginPath()
        eg.moveTo(cx, cy)
        g.moveTo(cx, cy)
        for (let k = 0; k < len; k++) {
          ca += (R2() - 0.5) * 0.9
          cx += Math.cos(ca) * 7
          cy += Math.sin(ca) * 7
          eg.lineTo(cx, cy)
          g.lineTo(cx, cy)
        }
        eg.stroke()
        if (pass === 1) g.stroke()
      }
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const emissive = new THREE.CanvasTexture(ec)
  emissive.colorSpace = THREE.SRGBColorSpace
  return { map, emissive }
}

/** Facade with a window grid. A few windows still burn: the city was emptied, not dead. */
function facadeTextures(seed: number) {
  const R = rand(seed)
  const { c, g } = canvas(256, 512)
  const { c: ec, g: eg } = canvas(256, 512)
  const base = ['#2b2629', '#262225', '#302a2a', '#232123'][seed % 4]
  g.fillStyle = base
  g.fillRect(0, 0, 256, 512)
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, 256, 512)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.025)'
    g.fillRect(R() * 256, R() * 512, 2, 2)
  }
  const cols = 4
  const rows = 8
  for (let r = 0; r < rows; r++) {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, r * 64 + 58, 256, 6)
    for (let k = 0; k < cols; k++) {
      const x = 14 + k * 60
      const y = 10 + r * 64
      g.fillStyle = '#0d0b0c'
      g.fillRect(x, y, 40, 42)
      const v = R()
      if (v < 0.1) {
        eg.fillStyle = v < 0.025 ? '#ff4d4d' : '#ffa05a'
        eg.globalAlpha = 0.35 + R() * 0.5
        eg.fillRect(x + 2, y + 2, 36, 38)
        eg.globalAlpha = 1
        g.fillStyle = '#3a2a22'
        g.fillRect(x + 2, y + 2, 36, 38)
      } else if (v < 0.22) {
        // Broken pane.
        g.fillStyle = '#1b1718'
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + 40 * R(), y + 42)
        g.lineTo(x + 40, y + 42 * R())
        g.fill()
      }
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  const emissive = new THREE.CanvasTexture(ec)
  emissive.colorSpace = THREE.SRGBColorSpace
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping
  return { map, emissive }
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
