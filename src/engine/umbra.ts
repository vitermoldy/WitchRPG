import * as THREE from 'three'
import { RANKS, RITE, UNITS } from '../game/balance'
import { addShadow, hasUpgrade, isUnlocked, riteBlock, riteChance, type ShadowRecord } from '../game/progression'
import type { Game } from './game'
import { COLOR } from './palette'
import type { Unit } from './units'

export type WheelChoice = 'follow' | 'attack' | 'hold' | 'swap'

/** Soldiers of one call that each get their own pool; the rest rise out of the wide spill. */
const POOLS_PER_CALL = 90

/** How far from the witch the outer rank of an army this big stands (see the formation). */
function ringRadius(count: number) {
  let ring = 0
  let left = count
  while (left > 8 + ring * 4) {
    left -= 8 + ring * 4
    ring++
  }
  return 3.4 + ring * 1.8
}

interface Call {
  at: number
  rec: ShadowRecord
  pos: THREE.Vector3
  slot: number
}

/**
 * Umbra Rite (raising the fallen, one body or every glowing body in reach), the Shadow Room
 * (unlimited), calling the army out with T and sending it back with T, and orders for the army.
 */
export class Umbra {
  private readonly g: Game
  candidate: Unit | null = null
  /** Every body the next cast would raise: the one under the crosshair, or all glowing ones in reach. */
  targets: Unit[] = []
  casting: Unit[] = []
  progress = 0
  swapCd = 0
  summonCd = 0
  wheelOpen = false
  wheelChoice: WheelChoice | null = null
  private wheelX = 0
  private wheelY = 0
  private chargeTick = 0
  /** Game seconds since the fight began; fallen shadows reform against this clock. */
  private time = 0
  /** Fallen shadows and when they can be called again. */
  readonly downUntil = new Map<number, number>()
  /** Shadows waiting to rise during a call, in order. */
  private calls: Call[] = []
  /** The army has been called and not sent back: shadows that reform rise again by themselves. */
  armyOut = false

  constructor(g: Game) {
    this.g = g
  }

  reset() {
    this.candidate = null
    this.targets = []
    this.casting = []
    this.progress = 0
    this.swapCd = 0
    this.summonCd = 0
    this.wheelOpen = false
    this.downUntil.clear()
    this.calls = []
    this.time = 0
    this.armyOut = false
  }

  get riteOpen() {
    return isUnlocked(this.g.profile, 'rite')
  }

  /** Shadows standing on the field (rising ones included, sinking ones not). */
  field(): Unit[] {
    return this.g.units.units.filter((u) => u.team === 'shadow' && u.record && u.alive && u.state !== 'sinking')
  }

  /** Records that could be called right now: not out, not reforming. */
  ready(): ShadowRecord[] {
    const out = new Set(this.g.units.units.filter((u) => u.team === 'shadow' && u.record).map((u) => u.record!.id))
    const pending = new Set(this.calls.map((c) => c.rec.id))
    return this.g.profile.shadows.filter((s) => !out.has(s.id) && !pending.has(s.id) && (this.downUntil.get(s.id) ?? 0) <= this.time)
  }

  reforming(): { count: number; next: number } {
    let count = 0
    let next = Infinity
    for (const [, at] of this.downUntil) {
      if (at > this.time) {
        count++
        next = Math.min(next, at - this.time)
      }
    }
    return { count, next: Number.isFinite(next) ? Math.ceil(next) : 0 }
  }

  /** Formation spot for slot `i`: rings behind the witch, 8 in the first, 4 more per ring. */
  private spot(i: number): THREE.Vector3 {
    const p = this.g.player
    let ring = 0
    let index = i
    while (index >= 8 + ring * 4) {
      index -= 8 + ring * 4
      ring++
    }
    const inRing = 8 + ring * 4
    const spread = Math.min(Math.PI * 1.6, 0.55 * inRing)
    const a = p.yaw + Math.PI + (index - (inRing - 1) / 2) * (spread / inRing)
    const d = 3.4 + ring * 1.8
    const at = new THREE.Vector3(p.pos.x - Math.sin(a) * d, p.pos.y, p.pos.z - Math.cos(a) * d)
    at.y = this.g.colliders.groundAt(at.x, at.z, 0.5, p.pos.y + 1.5, 2.5)
    // Over the void (or while she flies high) they rise where she can stand.
    if (at.y < -50 || at.y < p.pos.y - 6) {
      const below = this.g.colliders.groundAt(p.pos.x, p.pos.z, 0.5, p.pos.y, 0.5)
      at.set(p.pos.x + (Math.random() - 0.5) * 2, below > -50 ? below : p.pos.y, p.pos.z + (Math.random() - 0.5) * 2)
    }
    return at
  }

  /** T: call the whole army out of the Shadow Room, or send all of it back. */
  toggle() {
    if (this.summonCd > 0) return
    if (this.armyOut || this.field().length || this.calls.length) this.dismiss()
    else this.summon()
    this.summonCd = RITE.summonCooldown
  }

  /**
   * The call: darkness spills out from under the witch, a pool opens at every soldier's place in the
   * formation, they rise out of it from the inside of the ranks to the outside, and their eyes light last.
   */
  summon() {
    const g = this.g
    const ready = this.ready()
    if (!g.profile.shadows.length) {
      g.hud.message(this.riteOpen ? 'Ruang Bayangan masih kosong. Bangkitkan musuh yang kalah dengan Tahan R.' : 'Ruang Bayangan masih kosong. Umbra Rite terbuka di Lv 2.', 'umbra')
      return
    }
    if (!ready.length) {
      const r = this.reforming()
      g.hud.message(r.count ? `Semua bayangan sedang terbentuk kembali. Yang pertama siap dalam ${r.next} detik.` : 'Tidak ada bayangan yang bisa dipanggil.', 'umbra')
      return
    }
    // Every shadow that is ready comes out, strongest first: Marsekal, Jenderal, Ksatria, then by level.
    const order = { marsekal: 0, jenderal: 1, ksatria: 2, prajurit: 3 }
    const pick = [...ready].sort((a, b) => order[a.rank] - order[b.rank] || b.level - a.level)
    const n = pick.length
    this.armyOut = true
    const p = g.player
    const feet = new THREE.Vector3(p.pos.x, g.colliders.groundAt(p.pos.x, p.pos.z, 0.5, p.pos.y, 0.5), p.pos.z)
    if (feet.y < -50 || feet.y < p.pos.y - 6) feet.y = p.pos.y
    const base = this.field().length
    // The darkness spreads as far as the outer rank stands; a big army rises within about 2.5 seconds.
    const spill = Math.min(60, Math.max(5 + Math.sqrt(n) * 2.4, ringRadius(base + n) + 3))
    const stagger = Math.min(0.06, 2.2 / Math.max(1, n))
    g.pools.open(feet, spill, 1.4 + n * stagger)
    g.pools.open(feet, spill * 0.45, 1.6 + n * stagger, 0.1)
    for (let i = 0; i < n; i++) {
      const pos = this.spot(base + i)
      const at = this.time + 0.35 + i * stagger
      this.calls.push({ at, rec: pick[i], pos, slot: base + i })
      // Each of the inner ranks gets its own pool; the rest rise out of the wide spill.
      if (i < POOLS_PER_CALL) g.pools.open(pos, 0.9 + UNITS[pick[i].kind].radius * 1.6, 1.4, 0.3 + i * stagger)
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2
      g.smoke.emit({ pos: { x: feet.x + Math.cos(a) * spill * 0.8, y: feet.y + 0.2, z: feet.z + Math.sin(a) * spill * 0.8 }, count: 1, color: 0x0c0614, life: 1.6, size: 1.6, sizeEnd: 2.8, vel: { x: Math.cos(a) * 1.5, y: 1.2, z: Math.sin(a) * 1.5 }, alpha: 0.75 })
    }
    g.hands.pose('right', 'rite', 0.9)
    g.hands.kick('right', 1.6)
    g.player.addTrauma(0.35)
    g.lights.flash(feet.clone().setY(feet.y + 2), COLOR.umbra, 30, spill * 1.5, 1.2)
    g.hud.umbraPulse()
    g.sfx.summon(n)
    const later = this.reforming().count
    g.hud.message(later ? `${n} bayangan dipanggil. ${later} lainnya menyusul setelah terbentuk kembali.` : `${n} bayangan dipanggil, seluruh Ruang Bayangan.`, 'umbra')
  }

  /** T again: every shadow on the field sinks into a pool and the darkness pulls back under the witch. */
  dismiss() {
    const g = this.g
    const out = this.field()
    this.calls = []
    this.armyOut = false
    if (!out.length) return
    out.forEach((u, i) => {
      if (i < POOLS_PER_CALL) g.pools.open(u.pos, 0.9 + u.radius * 1.6, 0.6)
      u.setState('sinking')
      u.vel.set(0, 0, 0)
    })
    const p = g.player
    const feet = new THREE.Vector3(p.pos.x, g.colliders.groundAt(p.pos.x, p.pos.z, 0.5, p.pos.y, 0.5), p.pos.z)
    if (feet.y < -50) feet.y = p.pos.y
    g.pools.open(feet, Math.min(60, Math.max(4 + Math.sqrt(out.length) * 1.8, out.length > POOLS_PER_CALL ? ringRadius(out.length) + 3 : 0)), 0.7, 0.4)
    for (const u of out.slice(0, 40)) g.streamTo(u.center, feet.clone().setY(feet.y + 0.3), COLOR.umbra)
    g.hands.pose('right', 'command', 0.6)
    g.sfx.dismiss()
    g.hud.message(`${out.length} bayangan kembali ke Ruang Bayangan.`, 'umbra')
  }

  private spawnShadow(rec: ShadowRecord, at: THREE.Vector3, slot: number) {
    const g = this.g
    const u = g.units.spawn(rec.kind, 'shadow', rec.level, at, true)
    u.record = rec
    u.slot = slot
    u.focusBonus = hasUpgrade(g.profile, 'focus') ? RITE.focusBonus : 0
    // UMB makes every soldier stronger.
    const power = g.derived.shadowPower
    u.maxHp *= power
    u.hp = u.maxHp
    u.damage *= power
    return u
  }

  /** Corpse glow, ash and clean-up; finds what a cast would raise; runs a call in progress. */
  update(dt: number, canAct: boolean) {
    const g = this.g
    this.time += dt
    this.swapCd = Math.max(0, this.swapCd - dt)
    this.summonCd = Math.max(0, this.summonCd - dt)
    const t = performance.now() / 1000
    const open = this.riteOpen
    const cam = g.camera
    const eye = g.player.eyePos
    const fwd = g.player.viewDir()
    let best: Unit | null = null
    let bestScore = Infinity
    const near: Unit[] = []

    // While the army is out, a shadow that has reformed rises again beside the witch.
    if (this.armyOut) {
    // Shadows of a call rise one after another.
    while (this.calls.length && this.calls[0].at <= this.time) {
      const c = this.calls.shift()!
      if (!g.profile.shadows.includes(c.rec)) continue
      this.spawnShadow(c.rec, c.pos, c.slot)
      g.smoke.emit({ pos: c.pos, count: 6, color: 0x0c0614, life: 1.2, size: 1, sizeEnd: 1.8, vel: { x: 0, y: 1.6, z: 0 }, jitter: 0.4, alpha: 0.8 })
    }

    for (const u of [...g.units.units]) {
      if (u.alive) continue
      if (u.team === 'shadow') {
        if (u.deadT > 1.1) g.units.remove(u)
        continue
      }
      const window = open && !u.riteTried ? RITE.window : RITE.plainCorpseTime
      const glowing = open && !u.riteTried && !u.ash && u.deadT < window
      const mat = u.model.bodyMat
      if (glowing) {
        const pulse = 0.55 + Math.sin(t * 4 + u.id) * 0.25
        const end = Math.min(1, (window - u.deadT) / 3)
        mat.emissive.set(COLOR.umbra)
        mat.emissiveIntensity = pulse * end * (this.casting.includes(u) ? 1.35 : 0.8)
        if (Math.random() < dt * 6) {
          g.glow.emit({ pos: u.pos, count: 1, color: COLOR.umbra, intensity: 2.2, life: 1.2, size: 0.12, vel: { x: 0, y: 0.9, z: 0 }, jitter: 0.5 })
        }
        const dist = u.pos.distanceTo(g.player.pos)
        if (dist < RITE.massRadius && !riteBlock(g.profile, u.kind)) near.push(u)
        if (dist < RITE.range) {
          const dir = u.pos.clone().setY(u.pos.y + 0.3).sub(eye).normalize()
          const ang = fwd.angleTo(dir)
          if (ang < 0.5) {
            const score = ang * 10 + dist * 0.1
            if (score < bestScore) {
              bestScore = score
              best = u
            }
          }
        }
      } else if (!u.ash && u.deadT >= (u.riteTried ? 0 : window)) {
        this.turnToAsh(u)
      }
      if (u.ash) {
        const k = Math.min(1, (u.deadT - (u.model.root.userData.ashAt ?? u.deadT)) / 2)
        mat.color.lerp(new THREE.Color(0x4a4446), 0.1)
        mat.emissiveIntensity = 0
        u.model.root.position.y = u.pos.y - k * 0.6
        if (k >= 1) g.units.remove(u)
      }
    }
    this.casting = this.casting.filter((u) => u.state === 'dead' && !u.riteTried && !u.ash)
    // Two or more glowing bodies in reach: one cast raises them all. Otherwise the one under the crosshair.
    if (this.casting.length) {
      this.candidate = this.casting[0]
      this.targets = this.casting
    } else {
      this.candidate = best ?? (near.length ? near[0] : null)
      this.targets = near.length >= 2 ? near : this.candidate ? [this.candidate] : []
    }

    // Casting.
    const holding = canAct && g.input.held('KeyR')
    if (this.casting.length && !holding) this.cancel()
    if (canAct && g.input.pressed('KeyR')) this.begin()
    if (this.casting.length) {
      const castTime = hasUpgrade(g.profile, 'rite') ? RITE.castTimeUpgraded : RITE.castTime
      this.progress += dt / castTime
      const from = g.hands.palmWorld('right', cam)
      for (const target of this.casting.slice(0, 14)) {
        const c = target.pos
        const s = Math.random()
        const p = from.clone().lerp(c, s)
        g.glow.emit({ pos: p, count: 1, color: COLOR.umbra, intensity: 2.4, life: 0.3, size: 0.1, vel: { x: (c.x - from.x) * 0.8, y: (c.y - from.y) * 0.8, z: (c.z - from.z) * 0.8 } })
        if (Math.random() < 0.5) g.smoke.emit({ pos: c, count: 1, color: 0x170a28, life: 1, size: 0.8, sizeEnd: 1.4, vel: { x: 0, y: 1, z: 0 }, jitter: 0.5, alpha: 0.7 })
      }
      g.hands.gather('right', this.progress)
      this.chargeTick -= dt
      if (this.chargeTick <= 0) {
        g.sfx.riteCharge(this.progress)
        this.chargeTick = 0.12
      }
      if (this.progress >= 1) this.complete([...this.casting])
    }

    if (canAct && g.input.pressed('KeyT')) this.toggle()

    // Command wheel.
    if (canAct && g.input.pressed('KeyZ')) {
      this.wheelOpen = true
      this.wheelX = this.wheelY = 0
      this.wheelChoice = null
      g.hands.pose('right', 'command')
    }
    if (this.wheelOpen) {
      this.wheelX += g.input.dx
      this.wheelY += g.input.dy
      const len = Math.hypot(this.wheelX, this.wheelY)
      if (len > 24) {
        const a = Math.atan2(this.wheelY, this.wheelX)
        // Up = follow, right = attack, down = hold, left = swap.
        if (a > -Math.PI * 0.75 && a <= -Math.PI * 0.25) this.wheelChoice = 'follow'
        else if (a > -Math.PI * 0.25 && a <= Math.PI * 0.25) this.wheelChoice = 'attack'
        else if (a > Math.PI * 0.25 && a <= Math.PI * 0.75) this.wheelChoice = 'hold'
        else this.wheelChoice = 'swap'
      }
      if (!g.input.held('KeyZ')) {
        this.wheelOpen = false
        g.hands.pose('right', 'idle')
        if (this.wheelChoice) this.order(this.wheelChoice)
      }
    }
  }

  private turnToAsh(u: Unit) {
    u.ash = true
    u.model.root.userData.ashAt = u.deadT
    this.casting = this.casting.filter((c) => c !== u)
    this.g.smoke.emit({ pos: u.pos, count: 8, color: 0x3a3436, life: 1.4, size: 0.6, sizeEnd: 1.2, speed: 0.4, vel: { x: 0, y: 0.5, z: 0 }, jitter: 0.4, alpha: 0.6 })
  }

  chance(u: Unit) {
    const g = this.g
    return riteChance(UNITS[u.kind].rank, g.profile.level, u.level, g.profile.stats.umb)
  }

  /** Mana for raising `n` bodies in one cast. */
  cost(n: number) {
    return RITE.mana + RITE.massManaPerExtra * Math.max(0, n - 1)
  }

  /** Why a cast on these bodies cannot start right now, or null when it can. */
  blocker(u?: Unit, n = 1): string | null {
    const g = this.g
    if (!this.riteOpen) return 'Umbra Rite terbuka di Lv 2.'
    const rank = u ? riteBlock(g.profile, u.kind) : null
    if (rank) return rank
    if (g.profile.shadows.length >= RITE.maxShadows) return 'Ruang Bayangan sudah penuh sekali. Lepas sebagian di Ledger (Tab).'
    const need = this.cost(n)
    if (!g.spells.overloaded && g.player.mana < need) return `Mana kurang: butuh ${need}.`
    return null
  }

  private begin() {
    const g = this.g
    const list = this.targets
    if (!list.length) return
    const why = this.blocker(list.length === 1 ? list[0] : undefined, list.length)
    if (why) {
      g.hud.message(why, 'umbra')
      if (why.startsWith('Mana')) g.hud.flashMana()
      return
    }
    this.casting = [...list]
    this.progress = 0
    g.hands.pose('right', 'rite')
  }

  cancel() {
    if (!this.casting.length) return
    this.casting = []
    this.progress = 0
    this.g.hands.pose('right', 'idle')
  }

  /** Taking damage breaks the cast (GDD). */
  interrupt() {
    if (this.casting.length) {
      this.g.hud.message('Cast terputus karena kamu terkena serangan.', 'umbra')
      this.cancel()
    }
  }

  /** Every body rolls its own chance (GDD: one roll per body). */
  private complete(list: Unit[]) {
    const g = this.g
    this.casting = []
    this.progress = 0
    if (!g.spells.overloaded) g.player.mana -= this.cost(list.length)
    g.hands.pose('right', 'push', 0.4)
    g.hands.kick('right', 1.4)
    const raised: ShadowRecord[] = []
    let faded = 0
    for (const u of list) {
      u.riteTried = true
      if (Math.random() >= this.chance(u)) {
        this.turnToAsh(u)
        faded++
        continue
      }
      const rec = addShadow(g.profile, u.kind, u.level)
      if (!rec) {
        this.turnToAsh(u)
        continue
      }
      raised.push(rec)
      const at = u.pos.clone()
      g.units.remove(u)
      g.pools.open(at, 0.9 + UNITS[rec.kind].radius * 1.6, 1.3)
      // Room on the field: it stands up here. No room: it sinks straight into the Shadow Room.
      if (this.field().length < this.fieldCap) this.spawnShadow(rec, at, this.field().length)
      else g.streamTo(at.clone().setY(at.y + 0.5), g.player.pos.clone().setY(g.player.pos.y + 0.3), COLOR.umbra)
      g.rift.raised.push(rec.name)
    }
    if (raised.length) {
      g.player.addTrauma(Math.min(0.5, 0.15 + raised.length * 0.04))
      g.sfx.riteResult(true)
      if (raised.length === 1 && !faded) {
        const rec = raised[0]
        g.hud.message(`Bayangan baru: ${rec.name}, ${RANKS[rec.rank].label} dari ${UNITS[rec.kind].name} Lv ${rec.level}.`, 'umbra')
        g.hud.riteResult(true, rec.name)
      } else {
        g.hud.message(`${raised.length} bangkit${faded ? `, ${faded} pudar` : ''}. Ruang Bayangan sekarang menampung ${g.profile.shadows.length} bayangan.`, 'umbra')
        g.hud.riteResult(true, `${raised.length} bayangan`)
      }
      g.saveSoon()
    } else {
      g.sfx.riteResult(false)
      g.hud.message(list.length === 1 ? `Esensi ${UNITS[list[0].kind].name} pudar. Peluangnya ${Math.round(this.chance(list[0]) * 100)}%, dan setiap tubuh hanya bisa dicoba sekali.` : `Semua ${faded} esensi pudar. Setiap tubuh hanya bisa dicoba sekali.`, 'umbra')
      g.hud.riteResult(false, '')
    }
  }

  /** A fallen shadow needs time to reform before it can be called again. */
  shadowFell(u: Unit) {
    const g = this.g
    if (u.record) {
      this.downUntil.set(u.record.id, this.time + RITE.reform)
      g.hud.message(`${u.record.name} tumbang. Ia terbentuk kembali dalam ${RITE.reform} detik.`, 'umbra')
    }
    g.smoke.emit({ pos: u.pos, count: 18, color: 0x170a28, life: 1.3, size: 1, sizeEnd: 1.8, speed: 1.2, vel: { x: 0, y: 1.2, z: 0 }, jitter: 0.5, alpha: 0.8 })
    g.glow.emit({ pos: u.center, count: 20, color: COLOR.umbra, intensity: 2.4, life: 0.8, size: 0.14, speed: 2.5 })
  }

  private order(choice: WheelChoice) {
    const g = this.g
    const shadows = this.field()
    if (!shadows.length && choice !== 'swap') {
      g.hud.message('Belum ada bayangan di medan. Tekan T untuk memanggil mereka.', 'umbra')
      return
    }
    if (choice === 'follow') {
      for (const s of shadows) {
        s.command = 'follow'
        s.focus = null
        s.target = null
      }
      g.hud.message('Perintah: ikuti aku.', 'umbra')
    } else if (choice === 'hold') {
      for (const s of shadows) {
        s.command = 'hold'
        s.holdPos.copy(s.pos)
        s.focus = null
        s.target = null
      }
      g.hud.message('Perintah: tahan posisi.', 'umbra')
    } else if (choice === 'attack') {
      const focusOn = isUnlocked(g.profile, 'focus')
      const hit = g.spells.aim(60, { props: false })
      let target = hit.unit
      if (!target) {
        // Nearest enemy to where the crosshair lands.
        let bd = 10
        for (const e of g.units.enemies()) {
          const d = e.pos.distanceTo(hit.point)
          if (d < bd) {
            bd = d
            target = e
          }
        }
      }
      if (!target) {
        g.hud.message('Tidak ada musuh di dekat titik bidik.', 'umbra')
        return
      }
      for (const s of shadows) {
        s.command = 'attack'
        // Before Perintah Fokus each shadow takes the enemy nearest the mark; after, all hit one target.
        let mine: Unit = target
        if (!focusOn) {
          let bd = Infinity
          for (const e of g.units.enemies()) {
            const d = e.pos.distanceTo(target.pos) + e.pos.distanceTo(s.pos) * 0.3
            if (d < bd && e.pos.distanceTo(target.pos) < 8) {
              bd = d
              mine = e
            }
          }
        }
        s.focus = mine
        s.target = mine
        s.focusBonus = focusOn && hasUpgrade(g.profile, 'focus') ? RITE.focusBonus : 0
      }
      g.hud.message(focusOn ? `Perintah Fokus: semua bayangan menyerang ${UNITS[target.kind].name}.` : 'Perintah: serang di titik bidik.', 'umbra')
      g.rings.spawn(target.pos, COLOR.umbra, 0.2, 1.6, 0.5)
    } else if (choice === 'swap') {
      if (!isUnlocked(g.profile, 'swap')) {
        g.hud.message('Tukar Tempat terbuka di Lv 4.', 'umbra')
        return
      }
      if (this.swapCd > 0) {
        g.hud.message(`Tukar Tempat siap lagi dalam ${Math.ceil(this.swapCd)} detik.`, 'umbra')
        return
      }
      if (!shadows.length) {
        g.hud.message('Belum ada bayangan untuk bertukar tempat.', 'umbra')
        return
      }
      const eye = g.player.eyePos
      const fwd = g.player.viewDir()
      let pick = shadows[0]
      let ba = Infinity
      for (const s of shadows) {
        const a = fwd.angleTo(s.center.sub(eye))
        if (a < ba) {
          ba = a
          pick = s
        }
      }
      const mine = g.player.pos.clone()
      const theirs = pick.pos.clone()
      g.player.pos.copy(theirs)
      g.player.vel.set(0, 0, 0)
      pick.pos.copy(mine)
      this.swapCd = hasUpgrade(g.profile, 'swap') ? RITE.swapCooldownUpgraded : RITE.swapCooldown
      for (const at of [mine, theirs]) {
        g.smoke.emit({ pos: at, count: 14, color: 0x170a28, life: 0.9, size: 1, sizeEnd: 1.6, speed: 1.5, jitter: 0.4, alpha: 0.8 })
        g.glow.emit({ pos: at.clone().setY(1), count: 24, color: COLOR.umbra, intensity: 2.6, life: 0.5, size: 0.12, speed: 3 })
      }
      g.sfx.swap()
      g.player.addTrauma(0.2)
      g.hud.message(`Tukar Tempat dengan ${pick.record?.name ?? 'bayangan'}.`, 'umbra')
    }
    g.sfx.ui()
  }
}
