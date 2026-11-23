import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { BOSS, CAMERA, MOVE, SPELL, TIERS, UNITS, type TierId, type UnitKind } from '../game/balance'
import { chaosFromDamage, derive, gainXp, tierUnlocked, unitStats, xpForUnit, type Derived, type Profile } from '../game/progression'
import { loadProfile, saveProfile } from '../game/save'
import type { RiftRecord, SavedRift } from '../data/api'
import { SKILLS } from '../game/skills'
import { Hud } from '../ui/hud'
import { Ledger } from '../ui/ledger'
import { Sfx } from './audio'
import type { Box, Colliders } from './collide'
import { BossFight } from './boss'
import { LightPool, Particles, Rings, ShadowPools, Warnings } from './fx'
import { buildLair, type LairBuild } from './lair'
import { Projectiles } from './projectiles'
import { Hands } from './hands'
import { Input } from './input'
import { COLOR } from './palette'
import { Player } from './player'
import { PropSystem } from './props'
import { RiftDirector } from './rift'
import { Spells } from './spells'
import { Umbra } from './umbra'
import { Unit, UnitSystem, type DamageSource, type UnitHost } from './units'
import type { Team } from './models'
import { buildWorld, type WorldBuild } from './world'
import { buildOpenWorld, OW, type OpenWorldBuild } from './openworld'
import { WorldDirector } from './worldmode'

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
  readonly lair: LairBuild
  /** Collision of the map in use: the city, or the lair at the end of Tier III. */
  private activeColliders: Colliders
  get colliders(): Colliders {
    return this.activeColliders
  }
  inLair = false
  /** 'rift': an arena Rift (city or lair). 'world': the open city. */
  mode: 'rift' | 'world' = 'rift'
  map: 'city' | 'lair' | 'world' = 'city'
  readonly ow: OpenWorldBuild
  readonly worldDir: WorldDirector
  readonly pools: ShadowPools
  /** Where to put the witch back in the open world after a Rift entered from one of its gates. */
  returnToWorld: THREE.Vector3 | null = null
  /** The tier of the Rift in progress (or the last one played). */
  tier: TierId = 1
  readonly warnings: Warnings
  readonly projectiles: Projectiles
  private rockT = 0
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
  /** After every save of the witch; the account layer sends it to the server. */
  onSaved: (() => void) | null = null
  /** When a Rift ends: cleared, fallen, or left from the pause menu. */
  onRiftEnd: ((run: RiftRecord) => void) | null = null
  /** Set by the account layer: the Rift history for the Ledger. */
  historySource: (() => Promise<SavedRift[] | null>) | null = null

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
    this.derived = derive(this.profile.stats, this.profile.level)

    this.world = buildWorld(this.scene)
    this.lair = buildLair(this.scene)
    this.ow = buildOpenWorld(this.scene)
    this.activeColliders = this.world.colliders
    this.scene.add(this.glow.points, this.smoke.points)
    this.lights = new LightPool(this.scene, 6)
    this.rings = new Rings(this.scene)
    this.pools = new ShadowPools(this.scene)
    this.warnings = new Warnings(this.scene)
    this.input = new Input(canvas)
    this.input.virtualLock = debug

    const game = this
    const host: UnitHost = {
      get colliders() {
        return game.colliders
      },
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
      fire: (from, to, u) => {
        this.projectiles.fire(from, to, u.team === 'rift' ? 'rift' : 'witch', u.damage, u.spec.shot!, u)
        this.sfx.spit()
      },
      slamFx: (at, radius, team) => this.slamFx(at, radius, team),
      telegraph: (at, radius, seconds) => this.warnings.show(at, radius, seconds),
      summon: (kind, level, at, team, owner) => this.summonUnit(kind, level, at, team, owner),
      recall: (u) => this.recall(u),
    }
    this.unitHost = host
    this.units = new UnitSystem(host)
    this.scene.add(this.units.group)
    this.props = new PropSystem({
      get colliders() {
        return game.colliders
      },
      units: this.units,
      hurtUnit: (u, dmg, from, by) => this.hurtUnit(u, dmg, from, by),
      impactFx: (at, s) => this.impactFx(at, s),
    })
    this.scene.add(this.props.group)
    this.projectiles = new Projectiles({
      get colliders() {
        return game.colliders
      },
      units: this.units,
      player: {
        get pos() {
          return game.player.pos
        },
        get alive() {
          return game.player.alive && game.state === 'playing'
        },
      },
      glow: this.glow,
      smoke: this.smoke,
      hurtPlayer: (dmg, from) => this.hurtPlayer(dmg, from),
      hurtUnit: (u, dmg, from, by) => this.hurtUnit(u, dmg, from, by),
      inWarp: (at) => this.spells.inWarp(at),
      reflectDamage: SPELL.warp.reflectDamage,
      onReflect: () => this.sfx.reflect(),
    })
    this.scene.add(this.projectiles.group)
    this.spells = new Spells(this)
    this.umbra = new Umbra(this)
    this.rift = new RiftDirector(this)
    this.worldDir = new WorldDirector(this)
    this.hud = new Hud(this)
    this.ledger = new Ledger({
      profile: this.profile,
      changed: () => {
        this.applyStats(false)
        this.saveSoon()
      },
      sfxUi: () => this.sfx.ui(),
      liveShadows: () => new Set(this.units.shadows().map((u) => u.record!.id)),
      history: () => (this.historySource ? this.historySource() : Promise.resolve(null)),
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
    for (const kind of Object.keys(UNITS) as UnitKind[]) for (const team of ['rift', 'shadow'] as const) samples.push(this.units.spawn(kind, team, 1, new THREE.Vector3(0, -20, 0)))
    this.camera.position.set(0, 8, 24)
    this.camera.lookAt(0, 2, 0)
    // The lair is hidden until Tier III; show it for a moment so its shaders build now too.
    this.lair.group.visible = true
    await this.renderer.compileAsync(this.scene, this.camera)
    this.lair.group.visible = false
    this.renderer.compile(this.hands.scene, this.hands.camera)
    this.composer.render(0.016)
    for (const s of samples) this.units.remove(s)
  }

  setState(s: GameState) {
    // The title screen always looks over the city.
    if (s === 'title' && this.map !== 'city') this.useCity()
    this.state = s
    this.input.capture = s === 'playing'
    if (s === 'paused' || s === 'ledger' || s === 'title') this.sfx.resume()
    this.onState?.(s)
  }

  applyStats(refill: boolean) {
    const before = { hp: this.player.maxHp, mana: this.player.maxMana }
    this.derived = derive(this.profile.stats, this.profile.level)
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

  /** Saves the witch in this browser now and lets the account layer know. */
  persist() {
    this.saveTimer = -1
    saveProfile(this.profile)
    this.onSaved?.()
  }

  private endRift(result: RiftRecord['result']) {
    const r = this.rift
    this.onRiftEnd?.({
      tier: this.tier,
      result,
      wave: r.wave,
      waves: r.totalWaves,
      kills: r.kills,
      xpGained: r.xpGained,
      levelsGained: r.levelsGained,
      levelAfter: this.profile.level,
      shadowsRaised: r.raised.length,
      seconds: Math.round(r.elapsed),
      boss: r.bossDefeated,
      finishedAt: new Date().toISOString(),
    })
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
      this.world.colliders.boxes.push(b)
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
    let raw = u.team === 'rift' && u.vulnerable > 0 ? dmg * 1.25 : dmg
    // A Warden's shield stops most of what comes at it from the front; a throw goes through.
    const guard = u.spec.shield
    if (guard && by !== 'impact' && u.stun <= 0 && u.state !== 'air' && u.state !== 'held') {
      const to = new THREE.Vector3(from.x - u.pos.x, 0, from.z - u.pos.z).normalize()
      if (u.facing.dot(to) > 0.35) {
        raw *= 1 - guard
        this.glow.emit({ pos: u.center.add(u.facing.multiplyScalar(u.radius + 0.2)), count: 8, color: COLOR.rift, intensity: 2.6, life: 0.25, size: 0.12, speed: 3 })
        if (Math.random() < 0.5) this.sfx.clank()
      }
    }
    if (this.rift.boss && u === this.rift.boss.u) raw = this.rift.boss.filter(raw, by, from)
    if (raw <= 0) return
    // Chaos and feedback count only the damage that landed, not overkill.
    const amount = Math.min(u.hp, raw)
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
    const xp = xpForUnit(u.kind, u.level)
    if (u === this.rift.bossUnit && u.kind === 'riftlord') this.hud.banner('Rift Lord tumbang', 'Tubuhnya bisa dibangkitkan dengan Kebangkitan Jenderal (Lv 8).')
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
    this.persist()
    if (this.mode === 'rift') this.endRift('fallen')
    this.setState('dead')
  }

  /** Starts a fresh Rift of the given tier with the current witch. */
  async enterRift(tier: TierId = this.tier, fromWorld = false) {
    if (!tierUnlocked(this.profile, tier)) tier = 1
    this.tier = tier
    if (!fromWorld) this.returnToWorld = null
    this.mode = 'rift'
    const spec = TIERS[tier]
    this.sfx.start()
    this.useCity()
    this.units.clear()
    this.projectiles.clear()
    this.warnings.clear()
    this.pools.clear()
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
    this.rift.start(spec)
    this.setState('playing')
    if (this.profile.shadows.length) window.setTimeout(() => this.hintArmy(), 1800)
    this.hud.banner(
      spec.name,
      tier === 1
        ? 'Bertahan lima gelombang, lalu keluar lewat retakan di monumen.'
        : tier === 2
          ? 'Spitter menembak dari perancah. Tarik mereka turun dengan Telekinesis.'
          : 'Warden menahan bolt dengan perisai, lempar mereka. Di akhir, Rift Lord keluar sendiri.',
    )
    if (tier === 1 && this.profile.level === 1 && this.profile.clears === 0) {
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
    this.persist()
    if (this.ledgerReturn === 'playing' || this.ledgerReturn === 'paused') {
      this.setState('paused')
      this.onState?.('paused')
      // A click on "Tutup" is a user gesture, so the pointer can lock again right away.
      void this.resume()
    } else {
      this.setState(this.ledgerReturn)
    }
  }

  leaveRift() {
    // From the pause menu the Rift was still running; from the fallen screen it was already recorded.
    if (this.mode === 'rift' && (this.state === 'paused' || this.state === 'playing')) this.endRift('left')
    this.returnToWorld = null
    this.units.clear()
    this.projectiles.clear()
    this.pools.clear()
    this.spells.reset()
    this.umbra.reset()
    this.useCity()
    this.persist()
    this.setState('title')
  }

  /** Shows one map, uses its collision, and sets flight and fog for it. */
  private setMap(map: 'city' | 'lair' | 'world') {
    this.map = map
    this.inLair = map === 'lair'
    this.world.city.visible = map === 'city'
    this.lair.group.visible = map === 'lair'
    this.ow.group.visible = map === 'world'
    this.activeColliders = map === 'city' ? this.world.colliders : map === 'lair' ? this.lair.colliders : this.ow.colliders
    this.player.flightFree = map === 'world'
    this.player.ceiling = map === 'world' ? OW.ceiling : map === 'lair' ? 30 : 22
    ;(this.scene.fog as THREE.FogExp2).density = map === 'world' ? 0.0085 : 0.0135
    if (map !== 'world') this.lightAt(new THREE.Vector3())
  /** The city map: shown, colliding, with its props back in place. */
  private useCity() {
    if (!this.inLair && this.world.city.visible) return
    this.inLair = false
    this.world.city.visible = true
    this.lair.group.visible = false
    this.activeColliders = this.world.colliders
    this.respawnProps()
  }

  /** Through the gate at the end of Tier III: the lair, its boss, and the witch's shadows beside her. */
  enterLair() {
    this.inLair = true
    this.world.city.visible = false
    this.lair.group.visible = true
    this.lair.setFloor(true)
    this.activeColliders = this.lair.colliders
    this.props.clear()
    this.projectiles.clear()
    this.warnings.clear()
    this.spells.reset()
    for (const u of [...this.units.units]) if (u.team === 'rift' || !u.alive) this.units.remove(u)
    this.player.reset(this.lair.playerStart, 0)
    this.player.hp = this.player.maxHp
    this.player.mana = this.player.maxMana
    for (const s of this.units.shadows()) this.recall(s)
    const home = this.lair.platforms[0].center.clone()
    const boss = this.units.spawn('hollow', 'rift', TIERS[3].boss!.level, home.clone())
    boss.setState('rising')
    const fight = new BossFight(this, boss, home)
    this.rift.beginLair(fight)
    this.hud.fade()
    this.hud.banner('The Hollow Warden', 'Penjaga Jantung Rift. Tiga fase: hindari hantaman, bertahan di pilar, lalu buka cangkangnya dengan Reality Warp.')
    this.sfx.roar()
    this.player.addTrauma(0.5)
  }

  onBossDefeated() {
    this.profile.bossKills += 1
    this.projectiles.clear()
    this.hud.banner('The Hollow Warden tumbang', 'Jantung Rift berhenti berdetak. Retakan keluar terbuka di pilar tengah.')
    this.sfx.levelUp()
    this.sfx.collapse()
    this.player.addTrauma(0.6)
    this.persist()
  }

  /** Puts the rocks of phase 2 on the ring of pillars. */
  spawnRocks() {
    for (const at of this.lair.rockSpots) this.props.spawnRock(at)
  }

  /** Particles running from one point to another: the boss swallowing, a shadow returning. */
  streamTo(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    for (let i = 0; i < 24; i++) {
      const p = from.clone().lerp(to, Math.random() * 0.3)
      const v = to.clone().sub(p).multiplyScalar(1.6)
      this.glow.emit({ pos: p, count: 1, color, intensity: 2.6, life: 0.6, size: 0.2, sizeEnd: 0.05, vel: v, drag: 0 })
    }
  }

  summonUnit(kind: UnitKind, level: number, at: THREE.Vector3, team: Team, owner: Unit): Unit | null {
    if (this.units.units.length > 70) return null
    const u = this.units.spawn(kind, team, level, at, team === 'shadow')
    u.owner = owner
    const col = team === 'rift' ? COLOR.chaos : COLOR.umbra
    this.glow.emit({ pos: at.clone().setY(at.y + 1), count: 18, color: col, intensity: 2.2, life: 0.6, size: 0.2, speed: 2.5, jitter: 0.4 })
    this.smoke.emit({ pos: at, count: 6, color: team === 'rift' ? 0x120608 : 0x170a28, life: 1, size: 1.1, sizeEnd: 1.8, speed: 1, jitter: 0.5, alpha: 0.8 })
    return u
  }

  /** A shadow that fell into the void, or was left behind, rises again beside the witch. */
  recall(u: Unit) {
    const p = this.player.pos
    const a = Math.random() * Math.PI * 2
    const at = new THREE.Vector3(p.x + Math.cos(a) * 2, p.y, p.z + Math.sin(a) * 2)
    at.y = this.colliders.groundAt(at.x, at.z, u.radius, p.y + 1, 1.5)
    if (at.y < -50) at.copy(this.inLair ? this.lair.nearestTop(p) : p)
    u.pos.copy(at)
    u.lastGood.copy(at)
    u.vel.set(0, 0, 0)
    u.lifted = 0
    u.setState('rising')
  }

  slamFx(at: THREE.Vector3, radius: number, team: Team) {
    const col = team === 'rift' ? COLOR.rift : COLOR.umbra
    this.rings.spawn(at, col, 0.4, radius, 0.5)
    this.glow.emit({ pos: at.clone().setY(at.y + 0.3), count: 50, color: col, intensity: 2.6, life: 0.6, size: 0.25, sizeEnd: 0.04, speed: radius * 1.3, drag: 3, gravity: 4 })
    this.smoke.emit({ pos: at.clone().setY(at.y + 0.2), count: 16, color: 0x2a2224, life: 1.3, size: 1.6, sizeEnd: 2.8, speed: radius * 0.7, drag: 2.5, alpha: 0.7 })
    this.sfx.slam(radius > 6)
    const d = this.player.pos.distanceTo(at)
    this.player.addTrauma(Math.max(0, 0.6 - d * 0.03))
  }

  private finishRift() {
    this.profile.clears += 1
    this.profile.tierClears[this.tier] = (this.profile.tierClears[this.tier] ?? 0) + 1
    this.spells.reset()
    this.umbra.cancel()
    this.persist()
    this.endRift('cleared')
    this.input.unlock()
    this.setState('result')
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.hands.resize(w / h, h * this.renderer.getPixelRatio())
    const ph = h * this.renderer.getPixelRatio()
    this.glow.setViewport(ph, CAMERA.fov)
    this.smoke.setViewport(ph, CAMERA.fov)
    this.bloom.resolution.set(w / 2, h / 2)
  }

  start() {
    this.timer.connect(document)
    this.renderer.setAnimationLoop((ts) => {
      this.timer.update(ts)
      this.tick()
    })
  }

  private tick() {
    // Timer.reset() (on tab switches) measures with performance.now() while update() gets the
    // frame timestamp, which can be a few ms earlier: the next delta comes out negative. Never
    // let time run backwards into the simulation.
    const dt = Math.min(1 / 30, Math.max(0, this.timer.getDelta()))
    this.t += dt
    const s = this.state
    this.world.update(this.t)
    if (this.inLair) this.lair.update(this.t)
    if (this.saveTimer > 0) {
      this.saveTimer -= dt
      if (this.saveTimer <= 0) this.persist()
    }

    if (s === 'playing') {
      // ?debug runs can fast-forward the fight in fixed sub-steps.
      for (let i = 0; i < this.debugSpeed && this.state === 'playing'; i++) {
        this.simulate(dt)
        if (i < this.debugSpeed - 1) this.input.endFrame()
      }
    }
    else if (s === 'title' || s === 'loading' || s === 'result') this.orbit(dt)

    if (s !== 'paused' && s !== 'ledger') {
      this.glow.update(dt)
      this.smoke.update(dt)
      this.lights.update(dt)
      this.rings.update(dt)
    }
    const fighting = s === 'playing' || s === 'paused' || s === 'ledger' || s === 'dead'
    this.hands.scene.visible = fighting
    if (fighting) {
      const p = this.player
      if (s === 'playing' || s === 'dead') this.hands.update(dt, this.input.dx, this.input.dy, p.bobPhase, p.bobWeight, { left: 0, right: 0 })
      if (s === 'playing') p.applyCamera(this.camera, dt, this.profile.settings.headBob, this.profile.settings.shake)
      if (s === 'dead') {
        this.camera.position.y += (this.player.pos.y + 0.4 - this.camera.position.y) * Math.min(1, dt * 2)
        this.camera.rotation.z += (0.5 - this.camera.rotation.z) * Math.min(1, dt * 2)
      }
    }
    if (s === 'playing') this.hud.update(dt)
    this.composer.render(dt)
    this.input.endFrame()
  }

  private orbit(dt: number) {
    const a = this.t * 0.05
    this.camera.position.set(Math.sin(a) * 26, 7.5 + Math.sin(this.t * 0.2) * 0.8, Math.cos(a) * 26)
    this.camera.lookAt(0, 3.5, 0)
    if (this.camera.fov !== CAMERA.fov) {
      this.camera.fov = CAMERA.fov
      this.camera.updateProjectionMatrix()
    }
    this.embers(dt, new THREE.Vector3(0, 0, 0), 30)
  }

  private embers(dt: number, around: THREE.Vector3, r: number) {
    if (Math.random() < dt * 40) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * r
      this.glow.emit({
        pos: { x: around.x + Math.cos(a) * d, y: Math.random() * 3, z: around.z + Math.sin(a) * d },
        count: 1,
        color: Math.random() < 0.8 ? COLOR.chaosHot : COLOR.umbra,
        intensity: 1.8,
        life: 4,
        size: 0.07,
        vel: { x: (Math.random() - 0.5) * 0.6, y: 0.7 + Math.random() * 0.8, z: (Math.random() - 0.5) * 0.6 },
        drag: 0.2,
      })
    }
  }

  private simulate(dt: number) {
    const input = this.input
    const p = this.player
    const wheel = this.umbra.wheelOpen
    // While the command wheel is open, mouse movement picks an order instead of turning.
    const lookDx = input.dx
    const lookDy = input.dy
    if (wheel) {
      input.dx = 0
      input.dy = 0
    }
    const blockers = this.props.blockers()
    this.unitHost.propBlockers = blockers
    const unitCircles = this.units.units.filter((u) => u.alive && u.state !== 'held' && u.state !== 'air').map((u) => ({ pos: u.pos, radius: u.radius, top: u.pos.y + u.height }))
    p.update(dt, input, this.colliders, this.profile.settings.sensitivity, [...blockers, ...unitCircles], true)
    if (wheel) {
      input.dx = lookDx
      input.dy = lookDy
    }

    // Mana regen stops during Backlash.
    if (this.spells.backlashT <= 0 && this.spells.grabbed.length === 0) p.mana = Math.min(p.maxMana, p.mana + this.derived.manaRegen * dt)
    if (this.spells.overloaded) p.mana = Math.min(p.maxMana, p.mana + this.derived.manaRegen * dt)

    if (input.pressed('KeyF') && this.rift.nearExit()) {
      this.finishRift()
      return
    }
    if (input.pressed('KeyF') && this.rift.nearGate()) {
      this.enterLair()
      return
    }

    this.spells.update(dt, !wheel)
    this.umbra.update(dt, true)
    this.units.update(dt, this.t)
    this.props.update(dt)
    this.projectiles.update(dt)
    this.warnings.update(dt)
    this.rift.update(dt)
    if (this.inLair) this.lairUpdate(dt)
    this.embers(dt, p.pos, 18)

    // Hands follow what the witch is doing when no skill holds them.
    if (p.floating) this.hands.gather('left', 0.2)
    if (this.spells.overloaded && Math.random() < 0.5) this.hands.gather('right', 0.5)

    // Safety net: anything that leaves the city is pulled back.
    if (!this.inLair && p.pos.y < -5) p.reset(this.world.playerStart, p.yaw)
  }

  /** The void under the lair, and rocks for phase 2. */
  private lairUpdate(dt: number) {
    const p = this.player
    if (p.pos.y < -6 && p.alive) {
      const loss = Math.round(p.maxHp * BOSS.fallDamage)
      const back = this.lair.nearestTop(p.pos)
      p.reset(back, p.yaw)
      p.addTrauma(0.4)
      this.hud.hurtFlash(0.6)
      this.hud.message(`Jatuh ke kehampaan: ${loss} HP hilang. Tahan Spasi di udara untuk melayang antar pilar.`, 'chaos')
      this.sfx.hurt()
      p.hp -= loss
      if (p.hp <= 0) this.die()
    }
    // Phase 2 needs something to throw: keep three rocks within reach of the witch. Rocks that
    // missed and landed on the far side do not count, and the farthest go once there are too many.
    if (this.rift.boss?.phase === 2) {
      this.rockT -= dt
      if (this.rockT <= 0) {
        this.rockT = 2
        const rocks = this.props.props.filter((r) => r.kind === 'rock' && !r.held)
        const reach = rocks.filter((r) => !r.thrown && r.pos.distanceTo(p.pos) < 20)
        if (reach.length < 3) {
          const spots = [...this.lair.rockSpots]
            .filter((s) => !rocks.some((r) => r.pos.distanceTo(s) < 1.5))
            .sort((a, b) => a.distanceTo(p.pos) - b.distanceTo(p.pos))
          const spot = spots[0]
          if (spot) {
            this.props.spawnRock(spot)
            this.glow.emit({ pos: spot, count: 16, color: COLOR.rift, intensity: 2, life: 0.6, size: 0.18, speed: 2 })
          }
        }
        if (rocks.length > 10) {
          const far = rocks.filter((r) => !r.thrown).sort((a, b) => b.pos.distanceTo(p.pos) - a.pos.distanceTo(p.pos))[0]
          if (far) {
            this.props.group.remove(far.mesh)
            this.props.props.splice(this.props.props.indexOf(far), 1)
          }
        }
      }
    }
  }
}
