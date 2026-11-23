import * as THREE from 'three'
import { CHAOS, SPELL } from '../game/balance'
import { hasUpgrade, isUnlocked } from '../game/progression'
import type { SkillId } from '../game/skills'
import type { Game } from './game'
import { COLOR } from './palette'
import type { Prop } from './props'
import { Unit } from './units'

interface Bolt {
  pos: THREE.Vector3
  prev: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
  mesh: THREE.Mesh
  light: THREE.PointLight | null
}

interface Snare {
  pos: THREE.Vector3
  radius: number
  t: number
  duration: number
  mesh: THREE.Mesh
}

type Grabbed = { unit: Unit; prop?: undefined } | { prop: Prop; unit?: undefined }

export interface AimHit {
  point: THREE.Vector3
  dist: number
  unit: Unit | null
  prop: Prop | null
}

const RUNE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFade;
  uniform vec3 uColor;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float ring = smoothstep(0.03, 0.0, abs(r - 0.94)) + smoothstep(0.02, 0.0, abs(r - 0.78)) * 0.7;
    float spokes = smoothstep(0.04, 0.0, abs(sin(a * 6.0 + uTime * 0.8))) * step(0.78, r) * step(r, 0.94);
    float inner = smoothstep(0.02, 0.0, abs(r - 0.45 - 0.03 * sin(a * 3.0 - uTime * 2.0)));
    float fill = (1.0 - smoothstep(0.0, 0.95, r)) * 0.12;
    float v = (ring + spokes * 0.8 + inner * 0.6 + fill) * step(r, 1.0);
    gl_FragColor = vec4(uColor * v * 2.2, v * uFade);
  }
`
const RUNE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const SHIELD_FRAG = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uHit;
  uniform float uFade;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    vec2 g = vUv * vec2(24.0, 12.0);
    float hex = smoothstep(0.08, 0.0, abs(fract(g.x + 0.5 * floor(g.y)) - 0.5) - 0.42) + smoothstep(0.08, 0.0, abs(fract(g.y) - 0.5) - 0.44);
    float v = (f * 0.75 + hex * 0.04 + uHit * 0.35) * uFade;
    gl_FragColor = vec4(vec3(1.0, 0.16, 0.22) * v * 1.2, v * 0.4);
  }
`
const SHIELD_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const boltGeo = new THREE.SphereGeometry(0.11, 10, 8)
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOR.chaos).multiplyScalar(4) })

export class Spells {
  private readonly g: Game
  readonly bolts: Bolt[] = []
  readonly snares: Snare[] = []
  boltCd = 0
  burstCd = 0
  snareCd = 0
  barrierCd = 0
  grabbed: Grabbed[] = []
  chaos = 0
  overloadT = 0
  backlashT = 0
  barrierT = 0
  barrierAbsorb = 0
  private barrierHit = 0
  private readonly shield: THREE.Mesh
  private readonly tendril: THREE.Line
  private readonly tendrilPts: THREE.Vector3[] = []
  private tendrilLight: THREE.PointLight | null = null
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()

  constructor(g: Game) {
    this.g = g
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uFade: { value: 0 } },
        vertexShader: SHIELD_VERT,
        fragmentShader: SHIELD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.shield.visible = false
    this.shield.renderOrder = 12
    g.scene.add(this.shield)
    for (let i = 0; i < 16; i++) this.tendrilPts.push(new THREE.Vector3())
    this.tendril = new THREE.Line(
