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
      x += Math.cos(ang) * size * 0.017
      y += Math.sin(ang) * size * 0.017
      eg.lineTo(x, y)
      g.lineTo(x, y)
    }
    eg.stroke()
    g.stroke()
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  const em = new THREE.CanvasTexture(e)
  em.colorSpace = THREE.SRGBColorSpace
  return { map, em }
}

export function buildLair(scene: THREE.Scene): LairBuild {
  const group = new THREE.Group()
  group.name = 'lair'
  group.visible = false
  const colliders = new Colliders()
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a3236, roughness: 0.85, flatShading: true })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1719, roughness: 0.9, flatShading: true })
  const glowEdge = new THREE.MeshStandardMaterial({ color: 0x140806, emissive: COLOR.rift, emissiveIntensity: 0.9 })

  // The disc of phase 1.
  const tex = crackTexture(1024)
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.em, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.9 })
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(26, 25, 1.2, 64), floorMat)
  floor.position.y = -0.6
  floor.receiveShadow = true
  group.add(floor)

  // The void under it: a deep red glow that the fog swallows.
  const abyss = new THREE.Mesh(
    new THREE.CircleGeometry(90, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5a0a12), fog: true }),
  )
  abyss.rotation.x = -Math.PI / 2
  abyss.position.y = -38
  group.add(abyss)

  // Pillars: a wide one in the middle, a ring of eight, four at the edge.
  const platforms: Platform[] = []
  const pillar = (x: number, z: number, size: number, top: number) => {
    const depth = 14 + Math.random() * 10
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, depth, size), stone)
    body.position.set(x, top - depth / 2, z)
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(size + 0.3, 0.3, size + 0.3), dark)
    cap.position.set(x, top - 0.12, z)
    cap.receiveShadow = true
    group.add(cap)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(size * 0.55, 8, 5), stone)
    tip.position.set(x, top - depth - 4, z)
    tip.rotation.x = Math.PI
    group.add(tip)
    for (const [ex, ez, w, d] of [[0, size / 2, size, 0.06], [0, -size / 2, size, 0.06], [size / 2, 0, 0.06, size], [-size / 2, 0, 0.06, size]] as const) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.06, d + 0.3), glowEdge)
      edge.position.set(x + ex, top + 0.01, z + ez)
      group.add(edge)
    }
    const box = colliders.add(x, z, size, size, top)
    platforms.push({ box, center: new THREE.Vector3(x, top, z), size })
