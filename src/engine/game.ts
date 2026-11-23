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
