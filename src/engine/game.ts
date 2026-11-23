import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { CAMERA, MOVE } from '../game/balance'
import { chaosFromDamage, derive, gainXp, unitStats, xpForKill, type Derived, type Profile } from '../game/progression'
import { loadProfile, saveProfile } from '../game/save'
import { SKILLS } from '../game/skills'
import { Hud } from '../ui/hud'
import { Ledger } from '../ui/ledger'
import { Sfx } from './audio'
import type { Box, Colliders } from './collide'
import { LightPool, Particles, Rings } from './fx'
import { Hands } from './hands'
import { Input } from './input'
import { COLOR } from './palette'
import { Player } from './player'
import { PropSystem } from './props'
import { RiftDirector } from './rift'
import { Spells } from './spells'
import { Umbra } from './umbra'
import { Unit, UnitSystem, type DamageSource, type UnitHost } from './units'
import { buildWorld, type WorldBuild } from './world'

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'ledger' | 'result' | 'dead'

const SKILL_IDS = SKILLS.map((s) => s.id)

export class Game {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  readonly hands = new Hands()
  readonly input: Input
  readonly sfx = new Sfx()
  readonly player = new Player()
  readonly world: WorldBuild
  readonly colliders: Colliders
  readonly glow = new Particles(4000, 'glow')
  readonly smoke = new Particles(900, 'smoke')
  readonly lights: LightPool
  readonly rings: Rings
  readonly units: UnitSystem
  readonly props: PropSystem
  readonly spells: Spells
  readonly umbra: Umbra
  readonly rift: RiftDirector
  readonly hud: Hud
  readonly ledger: Ledger
  profile: Profile
  derived: Derived
  readonly saveError: string | null
  state: GameState = 'loading'
  private ledgerReturn: GameState = 'title'
  private readonly timer = new THREE.Timer()
  private t = 0
  private saveTimer = -1
  private readonly debug: boolean
  debugSpeed = 1
  private readonly brokenCover: Box[] = []
  private readonly unitHost: UnitHost
  onState: ((s: GameState) => void) | null = null

  constructor(canvas: HTMLCanvasElement, debug: boolean) {
    this.debug = debug
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    const loaded = loadProfile()
    this.profile = loaded.profile
    this.saveError = loaded.error
    this.derived = derive(this.profile.stats)

    this.world = buildWorld(this.scene)
    this.colliders = this.world.colliders
    this.scene.add(this.glow.points, this.smoke.points)
    this.lights = new LightPool(this.scene, 6)
    this.rings = new Rings(this.scene)
    this.input = new Input(canvas)
    this.input.virtualLock = debug

    const game = this
    const host: UnitHost = {
      colliders: this.colliders,
      player: {
        get pos() {
          return game.player.pos
        },
        get yaw() {
          return game.player.yaw
        },
        radius: MOVE.radius,
        get alive() {
          return game.player.alive && game.state === 'playing'
        },
        team: 'shadow',
      },
      glow: this.glow,
      smoke: this.smoke,
      propBlockers: [],
      hurtPlayer: (dmg, from) => this.hurtPlayer(dmg, from),
      hurtUnit: (u, dmg, from, by) => this.hurtUnit(u, dmg, from, by),
      impactFx: (at, s) => this.impactFx(at, s),
      growl: () => this.sfx.growl(),
    }
    this.unitHost = host
    this.units = new UnitSystem(host)
    this.scene.add(this.units.group)
    this.props = new PropSystem({
      colliders: this.colliders,
      units: this.units,
      hurtUnit: (u, dmg, from, by) => this.hurtUnit(u, dmg, from, by),
      impactFx: (at, s) => this.impactFx(at, s),
    })
    this.scene.add(this.props.group)
    this.spells = new Spells(this)
    this.umbra = new Umbra(this)
    this.rift = new RiftDirector(this)
    this.hud = new Hud(this)
    this.ledger = new Ledger({
      profile: this.profile,
      changed: () => {
        this.applyStats(false)
        this.saveSoon()
      },
      sfxUi: () => this.sfx.ui(),
      liveShadows: () => new Set(this.units.shadows().map((u) => u.record!.id)),
    })
    this.ledger.onClose = () => this.afterLedger()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const handPass = new RenderPass(this.hands.scene, this.hands.camera)
    handPass.clear = false
    handPass.clearDepth = true
    this.composer.addPass(handPass)
    // One NaN pixel blurred by bloom turns the whole screen black. Zero any that slip through.
    this.composer.addPass(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        // isnan() is optimised away by the D3D compiler behind ANGLE, so test the exponent bits.
        fragmentShader: [
          'uniform sampler2D tDiffuse;',
          'varying vec2 vUv;',
          'bool bad(float v) { return (floatBitsToUint(v) & 0x7f800000u) == 0x7f800000u; }',
          'void main() {',
          '  vec4 c = texture2D(tDiffuse, vUv);',
          '  if (bad(c.r) || bad(c.g) || bad(c.b) || bad(c.a)) c = vec4(0.0);',
          '  gl_FragColor = clamp(c, 0.0, 60000.0);',
          '}',
        ].join('\n'),
      }),
    )
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.82)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.input.onKey = (code) => {
      if (code === 'Tab' && this.state === 'playing') this.openLedger()
    }
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.setState('paused')
    }
    window.addEventListener('resize', () => this.resize())
    this.resize()
    this.applySettings()
    this.respawnProps()
  }

  /** Builds every shader once behind the loading screen so the first fight does not stutter. */
  async warmUp() {
    const samples: Unit[] = []
    for (const kind of ['husk', 'hound'] as const) for (const team of ['rift', 'shadow'] as const) samples.push(this.units.spawn(kind, team, 1, new THREE.Vector3(0, -20, 0)))
    this.camera.position.set(0, 8, 24)
    this.camera.lookAt(0, 2, 0)
    await this.renderer.compileAsync(this.scene, this.camera)
    this.renderer.compile(this.hands.scene, this.hands.camera)
    this.composer.render(0.016)
    for (const s of samples) this.units.remove(s)
  }

  setState(s: GameState) {
    this.state = s
    this.input.capture = s === 'playing'
    if (s === 'paused' || s === 'ledger' || s === 'title') this.sfx.resume()
    this.onState?.(s)
  }

  applyStats(refill: boolean) {
    const before = { hp: this.player.maxHp, mana: this.player.maxMana }
    this.derived = derive(this.profile.stats)
    const p = this.player
    p.maxHp = this.derived.maxHp
    p.maxMana = this.derived.maxMana
    p.speedMult = this.derived.speedMult
    p.floatMax = this.derived.floatTime
    if (refill) {
      p.hp = p.maxHp
      p.mana = p.maxMana
    } else {
      p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - before.hp))
      p.mana = Math.min(p.maxMana, p.mana + Math.max(0, p.maxMana - before.mana))
    }
  }

  applySettings() {
    this.sfx.setVolume(this.profile.settings.volume)
  }

  saveSoon() {
    this.saveTimer = 0.4
  }

  private respawnProps() {
    this.props.clear()
    for (const s of this.world.props) {
      if (s.kind === 'car') this.props.spawnCar(s.x, s.z, s.yaw)
      else for (let i = 0; i < (s.stack ?? 1); i++) this.props.spawnCrate(s.x + (Math.random() - 0.5) * 0.1, s.z + (Math.random() - 0.5) * 0.1, s.yaw + (Math.random() - 0.5) * 0.4, i)
    }
    for (const b of this.brokenCover) {
      b.alive = true
      if (b.mesh) b.mesh.visible = true
      this.colliders.boxes.push(b)
    }
    this.brokenCover.length = 0
  }

  breakCover(b: Box, from: THREE.Vector3) {
    if (!b.alive) return
    this.colliders.remove(b)
    if (b.mesh) b.mesh.visible = false
    this.brokenCover.push(b)
    const cx = (b.minX + b.maxX) / 2
    const cz = (b.minZ + b.maxZ) / 2
    const wide = b.maxX - b.minX > b.maxZ - b.minZ
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 0.7
      const at = new THREE.Vector3(cx + (wide ? off : 0), 0.5 + Math.random() * 1, cz + (wide ? 0 : off))
      const away = at.clone().sub(from).setY(0).normalize().multiplyScalar(7 + Math.random() * 5)
      away.y = 4 + Math.random() * 3
      this.props.spawnChunk(at, away, wide ? 0.7 : 0.18, 0.5 + Math.random() * 0.4, wide ? 0.18 : 0.7)
    }
    this.smoke.emit({ pos: new THREE.Vector3(cx, 0.8, cz), count: 12, color: 0x2a2224, life: 1.4, size: 1.4, sizeEnd: 2.4, speed: 2, jitter: 0.6, alpha: 0.7 })
  }

  impactFx(at: THREE.Vector3, strength: number) {
    this.glow.emit({ pos: at, count: Math.round(8 + strength * 30), color: COLOR.chaosHot, intensity: 2.4, life: 0.4, size: 0.18, sizeEnd: 0.02, speed: 3 + strength * 5, gravity: 6 })
    this.smoke.emit({ pos: at, count: Math.round(3 + strength * 8), color: 0x2a2224, life: 1, size: 0.8 + strength, sizeEnd: 1.6 + strength, speed: 1 + strength * 2, alpha: 0.6 })
    if (strength > 0.25) {
      this.sfx.impact(strength)
      this.player.addTrauma(Math.max(0, strength * 0.35 - this.player.pos.distanceTo(at) * 0.01))
    }
  }

  hurtUnit(u: Unit, dmg: number, from: THREE.Vector3, by: DamageSource) {
    if (!u.alive || dmg <= 0) return
    // Chaos and feedback count only the damage that landed, not overkill.
    const amount = Math.min(u.hp, u.team === 'rift' && u.vulnerable > 0 ? dmg * 1.25 : dmg)
    u.hp -= amount
    u.flash = 1
    if (u.team === 'rift') {
      u.barShown = 3
      if (by === 'player' || by === 'impact') {
        this.spells.addChaos(chaosFromDamage(amount, 0))
        this.hud.hit(false)
      }
    }
    if (u.hp <= 0) this.kill(u, from, by)
  }

  private kill(u: Unit, from: THREE.Vector3, by: DamageSource) {
    u.setState('dead')
    u.deadT = 0
    u.hp = 0
    if (u.vel.lengthSq() < 1) u.vel.copy(u.pos).sub(from).setY(0).normalize().multiplyScalar(2)
    if (u.team === 'shadow') {
      this.umbra.shadowFell(u)
      return
    }
    if (by === 'player' || by === 'impact') this.hud.hit(true)
    this.glow.emit({ pos: u.center, count: 16, color: COLOR.rift, intensity: 2, life: 0.6, size: 0.12, speed: 2.5, gravity: 2 })
    const xp = xpForKill(u.level)
    this.rift.kills++
    this.rift.xpGained += xp
    const r = gainXp(this.profile, xp, SKILL_IDS)
    if (r.levelsGained) {
      this.rift.levelsGained += r.levelsGained
      this.applyStats(false)
      this.sfx.levelUp()
      this.hud.message(`Lv ${this.profile.level}. ${this.profile.statPoints} poin stat dan ${this.profile.skillPoints} poin skill menunggu di Ledger (Tab).`, 'level')
      for (const id of r.unlocked) {
        const s = SKILLS.find((k) => k.id === id)!
        this.hud.message(`Skill baru terbuka: ${s.name} (${s.key}).`, s.branch === 'chaos' ? 'chaos' : 'umbra')
      }
      this.lights.flash(this.player.eyePos, COLOR.rift, 8, 10, 0.6)
    }
    for (const sl of r.shadowLevels) {
      const live = this.units.units.find((x) => x.record?.id === sl.id && x.alive)
      if (!live) continue
      const ratio = live.hp / live.maxHp
      const st = unitStats(live.kind, sl.level, true)
      live.level = sl.level
      live.maxHp = st.hp
      live.hp = st.hp * ratio
      live.damage = st.damage
    }
    this.saveSoon()
  }

  hurtPlayer(dmg: number, from: THREE.Vector3) {
    const p = this.player
    if (!p.alive || this.state !== 'playing') return
    const left = this.spells.absorb(dmg)
    if (left <= 0) {
      this.sfx.barrier(true)
      return
    }
    p.hp -= left
    p.hurtTimer = 0.3
    this.hud.hurtFlash(Math.min(0.8, left / 30))
    p.addTrauma(Math.min(0.5, 0.12 + left / 60))
    this.sfx.hurt()
    this.spells.addChaos(chaosFromDamage(0, left))
    this.umbra.interrupt()
    // A little shove away from the hit.
    const push = p.pos.clone().sub(from).setY(0).normalize().multiplyScalar(3)
    p.vel.add(push)
    if (p.hp <= 0) this.die()
  }

  private die() {
    const p = this.player
    p.hp = 0
    p.alive = false
    this.spells.reset()
    this.umbra.cancel()
    this.hands.pose('left', 'lowered')
    this.hands.pose('right', 'lowered')
    this.input.unlock()
    saveProfile(this.profile)
    this.setState('dead')
  }

  /** Starts a fresh Tier I Rift with the current witch. */
  async enterRift() {
    this.sfx.start()
    this.units.clear()
    this.respawnProps()
    this.glow.clear()
    this.smoke.clear()
    this.lights.reset()
    this.spells.reset()
    this.umbra.reset()
    this.hud.clearFeed()
    this.player.reset(this.world.playerStart, 0)
    this.applyStats(true)
    this.hands.pose('left', 'idle')
    this.hands.pose('right', 'idle')
    this.rift.start()
    this.setState('playing')
    this.umbra.summonAll()
    this.hud.banner('Rift Tier I', 'Bertahan lima gelombang, lalu keluar lewat retakan di monumen.')
    if (this.profile.level === 1 && this.profile.clears === 0) {
      this.hud.message('Klik kiri untuk Hex Bolt. Tahan klik kanan untuk mengangkat, lepas untuk melempar.', 'chaos')
      window.setTimeout(() => this.hud.message('Di Lv 2 tubuh musuh mulai bersinar ungu: bidik lalu tahan R untuk membangkitkannya.', 'umbra'), 5000)
    }
    await this.input.lock()
  }

  async resume() {
    if (this.state !== 'paused') return
    const ok = await this.input.lock()
    if (ok || this.debug) {
      this.setState('playing')
    }
    return ok
  }

  openLedger(from: GameState = this.state) {
    this.ledgerReturn = from
    this.umbra.cancel()
    this.setState('ledger')
    this.input.unlock()
    this.ledger.open()
  }

  private afterLedger() {
    saveProfile(this.profile)
    if (this.ledgerReturn === 'playing' || this.ledgerReturn === 'paused') {
      this.setState('paused')
      this.onState?.('paused')
      // A click on "Tutup" is a user gesture, so the pointer can lock again right away.
      void this.resume()
    } else {
      this.setState(this.ledgerReturn)
