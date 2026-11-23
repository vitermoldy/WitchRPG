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
      new THREE.BufferGeometry().setFromPoints(this.tendrilPts),
      new THREE.LineBasicMaterial({ color: new THREE.Color(COLOR.chaos).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.tendril.frustumCulled = false
    this.tendril.visible = false
    g.scene.add(this.tendril)
  }

  reset() {
    for (const b of this.bolts) this.killBolt(b)
    this.bolts.length = 0
    for (const s of this.snares) this.g.scene.remove(s.mesh)
    this.snares.length = 0
    this.dropAll(false)
    this.boltCd = this.burstCd = this.snareCd = this.barrierCd = 0
    this.chaos = 0
    this.overloadT = this.backlashT = this.barrierT = 0
    this.shield.visible = false
    this.g.hands.overload = false
  }

  get overloaded() {
    return this.overloadT > 0
  }

  get damageMult() {
    return this.g.derived.damageMult * (this.overloaded ? CHAOS.overloadDamage : 1)
  }

  private unlocked(id: SkillId) {
    return isUnlocked(this.g.profile, id)
  }

  private upgraded(id: SkillId) {
    return hasUpgrade(this.g.profile, id)
  }

  /** Spends mana unless Overload makes skills free. */
  private pay(cost: number): boolean {
    if (this.overloaded || cost <= 0) return true
    const p = this.g.player
    if (p.mana < cost) {
      this.g.hud.flashMana()
      return false
    }
    p.mana -= cost
    return true
  }

  addChaos(amount: number) {
    if (this.overloaded) return
    const before = this.chaos
    this.chaos = Math.min(CHAOS.max, this.chaos + amount)
    if (before < CHAOS.max && this.chaos >= CHAOS.max) this.g.hud.message('Meter Chaos penuh. Tekan G untuk Crimson Overload.', 'chaos')
  }

  /** Where the crosshair points: the first unit, prop, wall or floor along the view ray. */
  aim(maxDist: number, opts: { units?: boolean; props?: boolean; team?: 'rift' | 'shadow' } = {}): AimHit {
    const o = this.g.player.eyePos
    const dir = this.g.player.viewDir()
    let best: AimHit = { point: o.clone().addScaledVector(dir, maxDist), dist: maxDist, unit: null, prop: null }
    const wall = this.g.colliders.raycast(o, dir, maxDist)
    if (wall) best = { point: wall.point, dist: wall.dist, unit: null, prop: null }
    const sphere = new THREE.Sphere()
    const ray = new THREE.Ray(o, dir)
    const hit = new THREE.Vector3()
    if (opts.units !== false) {
      for (const u of this.g.units.units) {
        if (!u.alive || (opts.team && u.team !== opts.team) || (!opts.team && u.team !== 'rift')) continue
        sphere.set(u.center, Math.max(u.radius, u.height * 0.42))
        if (ray.intersectSphere(sphere, hit)) {
          const d = hit.distanceTo(o)
          if (d < best.dist) best = { point: hit.clone(), dist: d, unit: u, prop: null }
        }
      }
    }
    if (opts.props !== false) {
      for (const p of this.g.props.props) {
        if (p.held || p.kind === 'chunk') continue
        sphere.set(p.pos, p.radius)
        if (ray.intersectSphere(sphere, hit)) {
          const d = hit.distanceTo(o)
          if (d < best.dist) best = { point: hit.clone(), dist: d, unit: null, prop: p }
        }
      }
    }
    return best
  }

  update(dt: number, canAct: boolean) {
    const g = this.g
    const input = g.input
    this.boltCd = Math.max(0, this.boltCd - dt)
    this.burstCd = Math.max(0, this.burstCd - dt)
    this.snareCd = Math.max(0, this.snareCd - dt)
    this.barrierCd = Math.max(0, this.barrierCd - dt)

    // Overload, then Backlash.
    if (this.overloadT > 0) {
      this.overloadT -= dt
      if (this.overloadT <= 0) {
        this.overloadT = 0
        this.backlashT = CHAOS.backlashTime
        g.hands.overload = false
        const loss = Math.round(g.player.hp * CHAOS.backlashHpLoss)
        g.player.hp = Math.max(1, g.player.hp - loss)
        g.hud.message(`Backlash: ${loss} HP hilang dan mana berhenti pulih selama 3 detik.`, 'chaos')
        g.hud.hurtFlash(0.5)
        g.sfx.overload(false)
      }
    }
    this.backlashT = Math.max(0, this.backlashT - dt)

    if (canAct) {
      if (input.pressed('KeyG') && this.chaos >= CHAOS.max && !this.overloaded) this.startOverload()
      if (input.held('Mouse0') && this.grabbed.length === 0 && this.boltCd <= 0) this.fireBolt()
      if (input.pressed('Mouse2')) this.tryGrip()
      if (input.pressed('KeyQ')) this.cast('burst')
      if (input.pressed('KeyE')) this.cast('snare')
      if (input.pressed('KeyX')) this.cast('barrier')
    }
    if (this.grabbed.length) {
      if (!canAct || input.released('Mouse2') || !input.held('Mouse2')) this.dropAll(canAct)
      else this.holdGrip(dt)
    }

    this.updateBolts(dt)
    this.updateSnares(dt)
    this.updateBarrier(dt)
  }

  private startOverload() {
    const g = this.g
    this.overloadT = CHAOS.overloadTime
    this.chaos = 0
    g.hands.overload = true
    g.hands.kick('left', 1.5)
    g.hands.kick('right', 1.5)
    g.player.addTrauma(0.45)
    g.sfx.overload(true)
    g.hud.message('Crimson Overload: damage +50% dan semua skill tanpa mana selama 12 detik.', 'chaos')
    g.lights.flash(g.player.eyePos, COLOR.chaos, 30, 18, 0.6)
  }

  private fireBolt() {
    const g = this.g
    this.boltCd = SPELL.bolt.cooldown
    const from = g.hands.palmWorld('left', g.camera)
    const target = this.aim(80).point
    const base = target.clone().sub(from).normalize()
    const spread = this.upgraded('hexBolt')
    const dirs = spread ? [-1, 0, 1].map((k) => base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), k * SPELL.bolt.spreadAngle)) : [base]
    const dmg = (spread ? SPELL.bolt.spreadDamage : SPELL.bolt.damage) * this.damageMult
    for (const d of dirs) {
      const mesh = new THREE.Mesh(boltGeo, boltMat)
      mesh.position.copy(from)
      g.scene.add(mesh)
      this.bolts.push({
        pos: from.clone(),
        prev: from.clone(),
        vel: d.multiplyScalar(SPELL.bolt.speed),
        life: SPELL.bolt.life,
        damage: dmg,
        mesh,
        light: g.lights.acquire(COLOR.chaos, 6, 7),
      })
    }
    g.hands.pose('left', 'cast', 0.25)
    g.hands.kick('left', 0.8)
    g.player.addTrauma(0.04)
    g.sfx.bolt()
    g.glow.emit({ pos: from, count: 8, color: COLOR.chaosHot, intensity: 3, life: 0.2, size: 0.12, speed: 2.5, jitter: 0.03 })
  }

  private killBolt(b: Bolt) {
    this.g.scene.remove(b.mesh)
    this.g.lights.release(b.light)
    b.light = null
  }

  private updateBolts(dt: number) {
    const g = this.g
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.prev.copy(b.pos)
      b.pos.addScaledVector(b.vel, dt)
      b.life -= dt
      b.mesh.position.copy(b.pos)
      b.light?.position.copy(b.pos)
      g.glow.emit({ pos: b.pos, count: 2, color: COLOR.chaos, intensity: 2.6, life: 0.22, size: 0.16, sizeEnd: 0.02, speed: 0.4, jitter: 0.04 })
      let hitAt: THREE.Vector3 | null = null
      let hitUnit: Unit | null = null
      let hitProp: Prop | null = null
      // Sweep the segment so fast bolts never tunnel through a thin body.
      const seg = this.tmp.copy(b.pos).sub(b.prev)
      const len = seg.length()
