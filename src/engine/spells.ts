import * as THREE from 'three'
import { CHAOS, SPELL } from '../game/balance'
import { hasUpgrade, isUnlocked } from '../game/progression'
import { skillById, type SkillId } from '../game/skills'
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

interface Warp {
  pos: THREE.Vector3
  radius: number
  t: number
  duration: number
  group: THREE.Group
  ruleMat: THREE.ShaderMaterial
  wallMat: THREE.ShaderMaterial
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
const WARP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
/** The wall of the Reality Warp field: bands that run upward and fade toward the top. */
const WARP_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFade;
  void main() {
    float bands = 0.5 + 0.5 * sin(vUv.y * 22.0 - uTime * 7.0 + sin(vUv.x * 40.0) * 0.6);
    float k = (1.0 - vUv.y) * (1.0 - vUv.y);
    vec3 col = mix(vec3(0.56, 0.33, 1.0), vec3(1.0, 0.16, 0.24), vUv.y) * 1.6;
    float a = k * (0.25 + 0.5 * bands) * uFade;
    gl_FragColor = vec4(col * a, a);
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
  warpCd = 0
  readonly warps: Warp[] = []
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
    for (const w of this.warps) this.g.scene.remove(w.group)
    this.warps.length = 0
    this.snares.length = 0
    this.dropAll(false)
    this.boltCd = this.burstCd = this.snareCd = this.barrierCd = this.warpCd = 0
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
        if (!u.alive || u.state === 'held' || (opts.team && u.team !== opts.team) || (!opts.team && u.team !== 'rift')) continue
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
    this.warpCd = Math.max(0, this.warpCd - dt)

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
      if (input.pressed('KeyV')) this.cast('warp')
    }
    if (this.grabbed.length) {
      if (!canAct || input.released('Mouse2') || !input.held('Mouse2')) this.dropAll(canAct)
      else this.holdGrip(dt)
    }

    this.updateBolts(dt)
    this.updateSnares(dt)
    this.updateBarrier(dt)
    this.updateWarps(dt)
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
      const dir = seg.clone().divideScalar(len || 1)
      const wall = g.colliders.raycast(b.prev, dir, len)
      let best = wall ? wall.dist : Infinity
      if (wall) hitAt = wall.point
      const ray = new THREE.Ray(b.prev, dir)
      const sphere = new THREE.Sphere()
      const p = new THREE.Vector3()
      for (const u of g.units.units) {
        if (u.team !== 'rift' || !u.alive || u.state === 'spawn') continue
        sphere.set(u.center, Math.max(u.radius, u.height * 0.42) + SPELL.bolt.radius)
        if (ray.intersectSphere(sphere, p)) {
          const d = p.distanceTo(b.prev)
          if (d <= len && d < best) {
            best = d
            hitAt = p.clone()
            hitUnit = u
            hitProp = null
          }
        }
      }
      for (const pr of g.props.props) {
        if (pr.held || pr.kind === 'chunk') continue
        sphere.set(pr.pos, pr.radius)
        if (ray.intersectSphere(sphere, p)) {
          const d = p.distanceTo(b.prev)
          if (d <= len && d < best) {
            best = d
            hitAt = p.clone()
            hitProp = pr
            hitUnit = null
          }
        }
      }
      if (hitAt || b.life <= 0) {
        const at = hitAt ?? b.pos
        if (hitUnit) g.hurtUnit(hitUnit, b.damage, b.prev, 'player')
        if (hitProp) g.props.push(hitProp, dir.clone().multiplyScalar(2).setY(0.5), 1)
        g.glow.emit({ pos: at, count: hitUnit ? 18 : 10, color: COLOR.chaosHot, intensity: 3, life: 0.35, size: 0.2, sizeEnd: 0.02, speed: 4, jitter: 0.05, gravity: 3 })
        g.lights.flash(at, COLOR.chaos, 8, 6, 0.18)
        if (hitUnit) g.sfx.hit()
        this.killBolt(b)
        this.bolts.splice(i, 1)
      }
    }
  }

  private grippable(u: Unit) {
    return u.alive && u.team === 'rift' && u.mass <= SPELL.grip.maxMass && u.state !== 'spawn'
  }

  private tryGrip() {
    const g = this.g
    if (!this.unlocked('grip')) return
    if (!this.overloaded && g.player.mana < 1) {
      g.hud.flashMana()
      return
    }
    const hit = this.aim(SPELL.grip.range)
    let first: Grabbed | null = null
    if (hit.unit && this.grippable(hit.unit)) first = { unit: hit.unit }
    else if (hit.prop && hit.prop.mass <= SPELL.grip.maxMass) first = { prop: hit.prop }
    else {
      // A little aim help: the closest body to the crosshair inside a narrow cone.
      const o = g.player.eyePos
      const f = g.player.viewDir()
      let bestA: number = SPELL.grip.aimCone
      for (const u of g.units.units) {
        if (!this.grippable(u)) continue
        const to = u.center.sub(o)
        const d = to.length()
        if (d > SPELL.grip.range) continue
        const a = f.angleTo(to)
        if (a < bestA && g.colliders.clear(o, u.center)) {
          bestA = a
          first = { unit: u }
        }
      }
      // Objects too: a rock on a pillar top is easy to miss by the width of the pillar's edge.
      for (const p of g.props.props) {
        if (p.held || p.kind === 'chunk' || p.mass > SPELL.grip.maxMass) continue
        const to = p.pos.clone().sub(o)
        if (to.length() > SPELL.grip.range) continue
        const a = f.angleTo(to)
        if (a < bestA) {
          bestA = a
          first = { prop: p }
        }
      }
    }
    if (!first) return
    this.grabbed = [first]
    if (this.upgraded('grip')) {
      const at = first.unit ? first.unit.pos : first.prop!.pos
      let second: Unit | null = null
      let sd = 4
      for (const u of g.units.units) {
        if (u === first.unit || !this.grippable(u)) continue
        const d = u.pos.distanceTo(at)
        if (d < sd) {
          sd = d
          second = u
        }
      }
      if (second) this.grabbed.push({ unit: second })
    }
    for (const gb of this.grabbed) {
      if (gb.unit) {
        gb.unit.setState('held')
        gb.unit.vel.set(0, 0, 0)
        gb.unit.target = null
      } else {
        gb.prop.held = true
        gb.prop.awake = true
        gb.prop.spin.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        g.props.wakeNear(gb.prop.pos, 2)
      }
    }
    g.hands.pose('left', 'grip')
    g.sfx.gripStart()
    this.tendril.visible = true
    this.tendrilLight = g.lights.acquire(COLOR.chaos, 5, 8)
  }

  private holdGrip(dt: number) {
    const g = this.g
    if (!this.overloaded) {
      g.player.mana -= SPELL.grip.manaPerSec * dt
      if (g.player.mana <= 0) {
        g.player.mana = 0
        g.hud.message('Mana habis, cengkeraman lepas.', 'chaos')
        this.dropAll(false)
        return
      }
    }
    const cam = g.camera
    const o = this.tmp2.copy(g.player.eyePos)
    const f = g.player.viewDir()
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize()
    this.grabbed = this.grabbed.filter((gb) => (gb.unit ? gb.unit.alive : true))
    if (!this.grabbed.length) {
      this.dropAll(false)
      return
    }
    this.grabbed.forEach((gb, i) => {
      const heavy = (gb.unit ? gb.unit.mass : gb.prop!.mass) > 200
      const dist = SPELL.grip.holdDistance + (heavy ? 2 : 0)
      const goal = o.clone().addScaledVector(f, dist).addScaledVector(right, i === 0 ? 0 : 1.4)
      goal.y = Math.max(goal.y, 0.6 + (gb.unit ? gb.unit.height * 0.5 : gb.prop!.halfH))
      const k = Math.min(1, dt * (heavy ? 5 : 9))
      if (gb.unit) {
        const c = gb.unit.center
        const nc = c.clone().lerp(goal, k)
        gb.unit.vel.copy(nc).sub(c).divideScalar(Math.max(dt, 1e-4))
        gb.unit.pos.add(nc.sub(c))
        gb.unit.yaw += dt * 2
      } else {
        const p = gb.prop!
        const np = p.pos.clone().lerp(goal, k)
        p.vel.copy(np).sub(p.pos).divideScalar(Math.max(dt, 1e-4))
        p.pos.copy(np)
      }
    })
    // Tendril from the left palm to the first body.
    const from = g.hands.palmWorld('left', cam)
    const first = this.grabbed[0]
    const to = first.unit ? first.unit.center : first.prop!.pos
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.6, 0))
    const t = performance.now() / 1000
    for (let i = 0; i < this.tendrilPts.length; i++) {
      const s = i / (this.tendrilPts.length - 1)
      const a = from.clone().lerp(mid, s)
      const b = mid.clone().lerp(to, s)
      const pt = a.lerp(b, s)
      pt.x += Math.sin(t * 23 + i * 1.7) * 0.06 * Math.sin(s * Math.PI)
      pt.y += Math.cos(t * 19 + i * 1.3) * 0.06 * Math.sin(s * Math.PI)
      this.tendrilPts[i].copy(pt)
    }
    this.tendril.geometry.setFromPoints(this.tendrilPts)
    this.tendrilLight?.position.copy(to)
    for (const gb of this.grabbed) {
      const c = gb.unit ? gb.unit.center : gb.prop!.pos
      g.glow.emit({ pos: c, count: 2, color: COLOR.chaos, intensity: 2.4, life: 0.4, size: 0.22, sizeEnd: 0.04, speed: 1.2, jitter: 0.5 })
    }
    if (Math.random() < 0.5) {
      const s = Math.random()
      g.glow.emit({ pos: this.tendrilPts[Math.floor(s * 15)], count: 1, color: COLOR.chaosHot, intensity: 2.5, life: 0.25, size: 0.1, speed: 0.6 })
    }
  }

  private dropAll(throwIt: boolean) {
    const g = this.g
    if (!this.grabbed.length) return
    // A throw flies at what the crosshair is on, nearly straight for its first moment.
    const aimAt = throwIt ? this.aim(80, { props: false }).point : null
    for (const gb of this.grabbed) {
      const mass = gb.unit ? gb.unit.mass : gb.prop!.mass
      const speed = mass >= 300 ? SPELL.grip.heavyThrowSpeed : mass > 200 ? SPELL.grip.throwSpeed * 0.6 : SPELL.grip.throwSpeed
      const from = gb.unit ? gb.unit.center : gb.prop!.pos
      const v = aimAt ? aimAt.clone().sub(from).normalize().multiplyScalar(speed) : new THREE.Vector3()
      if (gb.unit) {
        const u = gb.unit
        if (u.alive) {
          u.vel.copy(v)
          u.thrown = throwIt
          u.flight = throwIt ? SPELL.grip.flight : 0
          u.setState('air')
        }
      } else {
        const p = gb.prop
        p.held = false
        p.awake = true
        p.vel.copy(v)
        p.thrown = throwIt
        p.flight = throwIt ? SPELL.grip.flight : 0
        p.hitUnits.clear()
        if (throwIt) p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6)
      }
    }
    this.grabbed = []
    this.tendril.visible = false
    g.lights.release(this.tendrilLight)
    this.tendrilLight = null
    g.sfx.gripStop(throwIt)
    if (throwIt) {
      g.hands.pose('left', 'push', 0.3)
      g.hands.kick('left', 1.2)
      g.player.addTrauma(0.12)
    } else g.hands.pose('left', 'idle')
  }

  private cast(id: 'burst' | 'snare' | 'barrier' | 'warp') {
    const g = this.g
    if (!this.unlocked(id)) {
      const def = skillById(id)
      g.hud.message(`${def.name} terbuka di Lv ${def.unlock}.`, 'info')
      return
    }
    const cd = { burst: this.burstCd, snare: this.snareCd, barrier: this.barrierCd, warp: this.warpCd }[id]
    if (cd > 0) return
    const spec = SPELL[id]
    if (!this.pay(spec.mana)) return
    if (id === 'burst') this.burst()
    else if (id === 'snare') this.snare()
    else if (id === 'warp') this.warp()
    else this.raiseBarrier()
  }

  /** Reality Warp: a field where gravity turns over, rift globs turn back and the boss's shell opens. */
  private warp() {
    const g = this.g
    const s = SPELL.warp
    this.warpCd = s.cooldown
    const hit = this.aim(s.range, { props: false })
    const at = hit.unit ? hit.unit.pos.clone() : hit.point.clone()
    at.y = g.colliders.groundAt(at.x, at.z, 0.2, at.y + 0.5, 0.6)
    // Over the void the field hangs at the height of whatever it caught, or the witch's feet.
    if (at.y < -50) at.y = hit.unit ? hit.unit.pos.y : g.player.pos.y
    const group = new THREE.Group()
    group.position.copy(at)
    const ruleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uColor: { value: new THREE.Color(COLOR.umbra).lerp(new THREE.Color(COLOR.chaos), 0.35) } },
      vertexShader: RUNE_VERT,
      fragmentShader: RUNE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(s.radius * 2, s.radius * 2), ruleMat)
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 0.06
    disc.renderOrder = 7
    group.add(disc)
    const wallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: WARP_VERT,
      fragmentShader: WARP_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(s.radius, s.radius, 7, 48, 1, true), wallMat)
    wall.position.y = 3.5
    wall.renderOrder = 7
    group.add(wall)
    g.scene.add(group)
    this.warps.push({ pos: at, radius: s.radius, t: 0, duration: s.duration + (this.upgraded('warp') ? s.durationUpgrade : 0), group, ruleMat, wallMat })
    g.hands.pose('left', 'push', 0.5)
    g.hands.pose('right', 'push', 0.5)
    g.hands.kick('left', 1.4)
    g.hands.kick('right', 1.4)
    g.rings.spawn(at, COLOR.umbra, 0.5, s.radius, 0.6)
    g.lights.flash(at.clone().setY(at.y + 3), COLOR.umbra, 40, s.radius * 2.5, 0.8)
    g.player.addTrauma(0.3)
    g.sfx.warp()
  }

  /** True while `at` is inside a Reality Warp field. */
  inWarp(at: THREE.Vector3): boolean {
    for (const w of this.warps) if (Math.hypot(at.x - w.pos.x, at.z - w.pos.z) < w.radius && at.y > w.pos.y - 2 && at.y < w.pos.y + 9) return true
    return false
  }

  private updateWarps(dt: number) {
    const g = this.g
    for (let i = this.warps.length - 1; i >= 0; i--) {
      const w = this.warps[i]
      w.t += dt
      const fade = Math.min(1, w.t * 3) * Math.min(1, (w.duration - w.t) * 2)
      w.ruleMat.uniforms.uTime.value = w.t
      w.ruleMat.uniforms.uFade.value = fade
      w.wallMat.uniforms.uTime.value = w.t
      w.wallMat.uniforms.uFade.value = fade
      const left = w.duration - w.t
      for (const u of g.units.units) {
        if (u.team !== 'rift' || !u.alive || u.state === 'spawn') continue
  private burst() {
    const g = this.g
    const s = SPELL.burst
    this.burstCd = s.cooldown
    const hit = this.aim(s.range, { props: false })
    const at = hit.unit ? hit.unit.pos.clone() : hit.point.clone()
    // A shot into open air bursts on the floor below the end of its reach.
    if (!hit.unit && hit.dist >= s.range - 0.01) at.y = g.colliders.groundAt(at.x, at.z, 0.2, at.y, 0.3)
    at.y = Math.max(0, at.y)
    const r = s.radius + (this.upgraded('burst') ? s.radiusUpgrade : 0)
    this.explode(at, r, s.damage * this.damageMult, s.push, s.lift, true)
    g.hands.pose('left', 'push', 0.35)
    g.hands.kick('left', 1.6)
    g.sfx.burst()
  }

  /** Shared by Chaos Burst and the barrier blast. */
  explode(at: THREE.Vector3, r: number, damage: number, push: number, lift: number, breakCover: boolean) {
    const g = this.g
    for (const u of g.units.units) {
      if (u.team !== 'rift' || !u.alive) continue
      const d = u.pos.distanceTo(at)
      if (d > r) continue
      const k = 1 - 0.5 * (d / r)
      g.hurtUnit(u, damage * k, at, 'player')
      if (u.alive && u.state !== 'held') {
        const dir = new THREE.Vector3(u.pos.x - at.x, 0, u.pos.z - at.z)
        if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        dir.normalize().multiplyScalar(push * k)
        dir.y = lift * k
        g.units.knock(u, dir)
      } else if (!u.alive) {
        const dir = new THREE.Vector3(u.pos.x - at.x, 0, u.pos.z - at.z).normalize().multiplyScalar(push * 0.5 * k)
        dir.y = lift * 0.5 * k
        u.vel.copy(dir)
      }
    }
    for (const p of g.props.props) {
      if (p.held) continue
      const d = p.pos.distanceTo(at)
      if (d > r) continue
      const k = 1 - 0.5 * (d / r)
      const dir = new THREE.Vector3(p.pos.x - at.x, 0, p.pos.z - at.z).normalize().multiplyScalar(push * k)
      dir.y = lift * k
      g.props.push(p, dir)
    }
    if (breakCover) {
      for (const b of [...g.world.breakables]) {
        if (!b.alive) continue
        const cx = (b.minX + b.maxX) / 2
        const cz = (b.minZ + b.maxZ) / 2
        if (Math.hypot(cx - at.x, cz - at.z) > r + 1) continue
        g.breakCover(b, at)
      }
    }
    g.glow.emit({ pos: at.clone().setY(at.y + 0.6), count: 140, color: COLOR.chaos, intensity: 3, life: 0.7, size: 0.5, sizeEnd: 0.05, speed: r * 1.4, jitter: 0.4, drag: 3, gravity: 2 })
    g.glow.emit({ pos: at.clone().setY(at.y + 0.6), count: 40, color: COLOR.chaosHot, intensity: 4, life: 0.35, size: 1.2, sizeEnd: 0.2, speed: r * 0.6, jitter: 0.3, drag: 4 })
    g.smoke.emit({ pos: at.clone().setY(at.y + 0.4), count: 26, color: 0x1a0c0e, life: 1.6, size: 2.2, sizeEnd: 3.4, speed: r * 0.5, jitter: 1, drag: 2.5, alpha: 0.75 })
    g.rings.spawn(at, COLOR.chaos, 0.5, r, 0.45)
    g.rings.spawn(at, COLOR.chaosHot, 0.2, r * 0.6, 0.3)
    g.lights.flash(at.clone().setY(at.y + 1.5), COLOR.chaos, 60, r * 3, 0.5)
    const near = g.player.pos.distanceTo(at)
    g.player.addTrauma(Math.max(0.15, 0.6 - near * 0.02))
  }

  private snare() {
    const g = this.g
    const s = SPELL.snare
    this.snareCd = s.cooldown
    const hit = this.aim(s.range, { props: false })
    const at = hit.unit ? hit.unit.pos.clone() : hit.point.clone()
    at.y = g.colliders.groundAt(at.x, at.z, 0.2, at.y, 0.3)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uColor: { value: new THREE.Color(COLOR.chaos) } },
      vertexShader: RUNE_VERT,
      fragmentShader: RUNE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.radius * 2, s.radius * 2), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.copy(at).setY(at.y + 0.05)
    mesh.renderOrder = 7
    g.scene.add(mesh)
    this.snares.push({ pos: at, radius: s.radius, t: 0, duration: s.duration + (this.upgraded('snare') ? s.durationUpgrade : 0), mesh })
    g.hands.pose('left', 'push', 0.35)
    g.hands.kick('left', 1)
    g.sfx.snare()
    g.rings.spawn(at, COLOR.chaos, s.radius * 0.2, s.radius, 0.4)
  }

  private updateSnares(dt: number) {
    const g = this.g
    for (const u of g.units.units) u.slow = 1
    for (let i = this.snares.length - 1; i >= 0; i--) {
      const s = this.snares[i]
      s.t += dt
      const mat = s.mesh.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = s.t
      mat.uniforms.uFade.value = Math.min(1, s.t * 4) * Math.min(1, (s.duration - s.t) * 2)
      for (const u of g.units.units) {
        if (u.team !== 'rift' || !u.alive) continue
        if (Math.hypot(u.pos.x - s.pos.x, u.pos.z - s.pos.z) < s.radius) {
          u.slow = 1 - SPELL.snare.slow
          u.vulnerable = 0.2
        }
      }
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * s.radius
        g.glow.emit({ pos: { x: s.pos.x + Math.cos(a) * r, y: s.pos.y + 0.1, z: s.pos.z + Math.sin(a) * r }, count: 1, color: COLOR.chaos, intensity: 2, life: 0.9, size: 0.12, vel: { x: 0, y: 1.2, z: 0 } })
      }
      if (s.t >= s.duration) {
        g.scene.remove(s.mesh)
        mat.dispose()
        s.mesh.geometry.dispose()
        this.snares.splice(i, 1)
      }
    }
  }

  private raiseBarrier() {
    const g = this.g
    const s = SPELL.barrier
    this.barrierCd = s.cooldown
    this.barrierT = s.duration
    this.barrierAbsorb = s.absorb + (this.upgraded('barrier') ? s.absorbUpgrade : 0)
    this.shield.visible = true
    g.hands.pose('left', 'block', s.duration)
    g.hands.pose('right', 'block', s.duration)
    g.sfx.barrier(true)
  }

  /** Damage meant for the witch: the barrier eats what it can and returns the rest. */
  absorb(dmg: number): number {
    if (this.barrierT <= 0) return dmg
    const taken = Math.min(this.barrierAbsorb, dmg)
    this.barrierAbsorb -= taken
    this.barrierHit = 1
    if (this.barrierAbsorb <= 0) this.endBarrier()
    return dmg - taken
  }

  private endBarrier() {
    const g = this.g
    const s = SPELL.barrier
    this.barrierT = 0
    this.shield.visible = false
    g.hands.pose('left', 'push', 0.3)
    g.hands.pose('right', 'push', 0.3)
    g.sfx.barrier(false)
    this.explode(g.player.pos.clone(), s.blastRadius, s.blastDamage * this.damageMult, s.push, 4, false)
  }

  private updateBarrier(dt: number) {
    if (this.barrierT <= 0) return
    this.barrierT -= dt
    this.barrierHit = Math.max(0, this.barrierHit - dt * 4)
    const mat = this.shield.material as THREE.ShaderMaterial
    mat.uniforms.uHit.value = this.barrierHit
    mat.uniforms.uFade.value = Math.min(1, (SPELL.barrier.duration - this.barrierT) * 6) * Math.min(1, this.barrierT * 4 + 0.3)
    this.shield.position.copy(this.g.camera.position)
    if (this.barrierT <= 0) this.endBarrier()
  }

  cooldowns() {
    return {
      burst: this.burstCd / SPELL.burst.cooldown,
      snare: this.snareCd / SPELL.snare.cooldown,
      barrier: this.barrierCd / SPELL.barrier.cooldown,
    }
  }
}
