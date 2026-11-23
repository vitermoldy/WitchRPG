import * as THREE from 'three'
import type { TierId, UnitKind } from '../game/balance'
import { Colliders } from './collide'
import { glowTexture } from './fx'
import { COLOR } from './palette'
import { makeTearMaterial } from './world'

/**
 * The open city around the Rifts: roads every 80 m, about two hundred buildings drawn as one
 * instanced mesh, an altar at the central square, three Rift gates, and creature camps whose level
 * grows with the distance from the square. A curtain of Rift light closes it in.
 */
export const OW = { half: 250, pitch: 80, road: 7, ceiling: 90 } as const

export interface Gate {
  tier: TierId
  pos: THREE.Vector3
  mat: THREE.ShaderMaterial
}

export interface CampSpot {
  id: number
  pos: THREE.Vector3
  levels: [number, number]
  pack: Partial<Record<Exclude<UnitKind, 'hollow'>, number>>
  elite: boolean
  mat: THREE.ShaderMaterial
}

export interface OpenWorldBuild {
  group: THREE.Group
  colliders: Colliders
  start: THREE.Vector3
  altar: THREE.Vector3
  gates: Gate[]
  camps: CampSpot[]
  cars: { x: number; z: number; yaw: number }[]
  update(t: number): void
}

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296
  }
}

/** Windows drawn from world position, so a facade of any size gets the same grid and lit panes. */
function facadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2528, roughness: 0.88, metalness: 0.05 })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vec4 wp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWn = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        #else
          vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
          vWn = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vWp = wp4.xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (abs(vWn.y) < 0.5) {
          float u = abs(vWn.x) > 0.5 ? vWp.z : vWp.x;
          vec2 cell = vec2(floor(u / 2.9), floor((vWp.y - 1.0) / 3.3));
          vec2 f = vec2(fract(u / 2.9), fract((vWp.y - 1.0) / 3.3));
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78) * step(2.0, vWp.y);
          float h = h21(cell + floor(vWp.xz / 37.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.045), win);
          vec3 lit = h > 0.985 ? vec3(1.0, 0.3, 0.3) : vec3(1.0, 0.62, 0.32);
          totalEmissiveRadiance += lit * win * step(0.93, h) * (0.6 + 0.4 * h21(cell * 1.7));
          // Grime that darkens toward the street.
          diffuseColor.rgb *= 0.75 + 0.25 * smoothstep(0.0, 14.0, vWp.y);
        } else {
          diffuseColor.rgb *= 0.7;
        }`,
      )
  }
  return mat
}

/** Asphalt roads, pale curbs, cracked concrete blocks; all from world position, no texture. */
function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c2729, roughness: 0.95 })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 m = mod(vWp.xz + ${OW.pitch / 2}.0, ${OW.pitch}.0) - ${OW.pitch / 2}.0;
        float rx = abs(m.x), rz = abs(m.y);
        float road = 1.0 - step(${OW.road}.0, min(rx, rz));
        float curb = (1.0 - road) * (1.0 - step(${OW.road + 3}.0, min(rx, rz)));
        float dash = road * step(min(rx, rz), 0.14) * step(0.5, fract((rx < rz ? vWp.z : vWp.x) / 6.0));
        float grain = n2(vWp.xz * 0.6) * 0.5 + n2(vWp.xz * 3.1) * 0.5;
        vec3 block = vec3(0.17, 0.155, 0.16) * (0.8 + 0.35 * grain);
        vec3 asphalt = vec3(0.09, 0.08, 0.085) * (0.85 + 0.3 * grain);
        vec3 col = mix(block, asphalt, road);
        col = mix(col, vec3(0.24, 0.22, 0.21), curb * 0.8);
        col = mix(col, vec3(0.55, 0.5, 0.45), dash * 0.5);
        float crack = smoothstep(0.03, 0.0, abs(n2(vWp.xz * 0.35) - 0.5)) * 0.6;
        col *= 1.0 - crack * 0.5;
        diffuseColor.rgb = col;`,
      )
  }
  return mat
}

const CURTAIN_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    float band = 0.5 + 0.5 * sin(vUv.x * 60.0 + uTime * 0.7 + sin(vUv.y * 9.0 + uTime) * 1.5);
    float fade = smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
    vec3 col = mix(vec3(0.5, 0.03, 0.08), vec3(1.2, 0.2, 0.3), band * 0.6);
    float a = fade * (0.35 + 0.3 * band);
    gl_FragColor = vec4(col * a, a);
  }
`

export function buildOpenWorld(scene: THREE.Scene): OpenWorldBuild {
  const group = new THREE.Group()
  group.name = 'openworld'
  group.visible = false
  const colliders = new Colliders()
  const R = rand(2026)
  const H = OW.half

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 40, H * 2 + 40), groundMaterial())
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  // Places that stay open: the square, the gates and the camps.
  const altar = new THREE.Vector3(0, 0, 0)
  const gateSpots: [TierId, number, number][] = [
    [1, 52, 52],
    [2, -150, 118],
    [3, 158, -150],
  ]
  const campDefs: { band: 0 | 1 | 2; elite?: boolean }[] = [
    ...Array.from({ length: 6 }, () => ({ band: 0 as const })),
    ...Array.from({ length: 6 }, () => ({ band: 1 as const })),
    ...Array.from({ length: 5 }, () => ({ band: 2 as const })),
    { band: 2, elite: true },
    { band: 2, elite: true },
  ]
  const bands = [
    { min: 70, max: 125, levels: [1, 3] as [number, number] },
    { min: 135, max: 185, levels: [4, 6] as [number, number] },
    { min: 195, max: 232, levels: [7, 9] as [number, number] },
  ]
  const reserved: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: 34 }]
  for (const [, x, z] of gateSpots) reserved.push({ x, z, r: 16 })
  const campSpots: { x: number; z: number; band: 0 | 1 | 2; elite: boolean }[] = []
  campDefs.forEach((c, i) => {
    const b = bands[c.band]
    for (let tries = 0; tries < 80; tries++) {
      const a = (i * 2.399 + tries * 0.7) % (Math.PI * 2)
      const d = b.min + R() * (b.max - b.min)
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      if (Math.abs(x) > H - 14 || Math.abs(z) > H - 14) continue
      if (reserved.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + 18)) continue
      reserved.push({ x, z, r: 18 })
      campSpots.push({ x, z, band: c.band, elite: !!c.elite })
      break
    }
  })

  // Buildings: each block between roads splits into a 3x3 grid of lots; most lots get a building.
  const boxes: { x: number; z: number; w: number; d: number; h: number }[] = []
  const lot = (OW.pitch - (OW.road + 3) * 2) / 3
  for (let bx = -H + OW.pitch / 2; bx < H; bx += OW.pitch) {
    for (let bz = -H + OW.pitch / 2; bz < H; bz += OW.pitch) {
      const ring = Math.hypot(bx, bz)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (R() < (i === 1 && j === 1 ? 0.6 : 0.15)) continue
          const cx = bx + (i - 1) * lot
          const cz = bz + (j - 1) * lot
          if (Math.abs(cx) > H - 8 || Math.abs(cz) > H - 8) continue
          const w = lot - 2 - R() * 5
          const d = lot - 2 - R() * 5
          if (reserved.some((r) => Math.abs(r.x - cx) < r.r + w / 2 && Math.abs(r.z - cz) < r.r + d / 2)) continue
          // Taller toward the middle ring, low and broken at the edges.
          const tall = ring < 180 ? 1 : 0.55
          const h = (10 + R() * R() * 60) * tall + 6
          boxes.push({ x: cx, z: cz, w, d, h })
        }
      }
    }
  }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facadeMaterial(), boxes.length)
  const m = new THREE.Matrix4()
  boxes.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d))
    inst.setMatrixAt(i, m)
    colliders.add(b.x, b.z, b.w, b.d, b.h)
  })
  inst.castShadow = true
  inst.receiveShadow = true
  group.add(inst)

  // The edge: a wall of Rift light and an invisible wall behind it.
  const curtainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: CURTAIN_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  for (let s = 0; s < 4; s++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 20, 140), curtainMat)
    c.position.set(s === 1 ? H + 4 : s === 3 ? -H - 4 : 0, 70, s === 0 ? -H - 4 : s === 2 ? H + 4 : 0)
    c.rotation.y = s % 2 ? Math.PI / 2 : 0
    group.add(c)
  }
  const wall = H + 2
  colliders.add(0, -wall, wall * 2 + 2, 1, 200)
