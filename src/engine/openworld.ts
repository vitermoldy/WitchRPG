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
