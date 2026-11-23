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
