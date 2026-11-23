import * as THREE from 'three'
import { RANKS, RITE, UNITS } from '../game/balance'
import { addShadow, hasUpgrade, isUnlocked, riteBlock, riteChance, type ShadowRecord } from '../game/progression'
import type { Game } from './game'
import { COLOR } from './palette'
import type { Unit } from './units'

export type WheelChoice = 'follow' | 'attack' | 'hold' | 'swap'

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
  }

  get riteOpen() {
    return isUnlocked(this.g.profile, 'rite')
  }

  /** Shadows standing on the field (rising ones included, sinking ones not). */
  field(): Unit[] {
    return this.g.units.units.filter((u) => u.team === 'shadow' && u.record && u.alive && u.state !== 'sinking')
  }

  get fieldCap() {
    return this.g.profile.settings.fieldCap
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

  /** T: call the army out of the Shadow Room, or send the field back into it. */
  toggle() {
    if (this.summonCd > 0) return
    if (this.field().length || this.calls.length) this.dismiss()
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
    // Strongest first: Marsekal, Jenderal, Ksatria, then by level.
    const order = { marsekal: 0, jenderal: 1, ksatria: 2, prajurit: 3 }
    const pick = [...ready].sort((a, b) => order[a.rank] - order[b.rank] || b.level - a.level).slice(0, Math.max(0, this.fieldCap - this.field().length))
    const n = pick.length
    const p = g.player
    const feet = new THREE.Vector3(p.pos.x, g.colliders.groundAt(p.pos.x, p.pos.z, 0.5, p.pos.y, 0.5), p.pos.z)
    if (feet.y < -50 || feet.y < p.pos.y - 6) feet.y = p.pos.y
    const spill = Math.min(26, 5 + Math.sqrt(n) * 2.4)
    const stagger = Math.min(0.06, 1.6 / Math.max(1, n))
    g.pools.open(feet, spill, 1.4 + n * stagger)
    g.pools.open(feet, spill * 0.45, 1.6 + n * stagger, 0.1)
    for (let i = 0; i < n; i++) {
      const pos = this.spot(this.field().length + i)
      const at = this.time + 0.35 + i * stagger
      this.calls.push({ at, rec: pick[i], pos, slot: this.field().length + i })
      g.pools.open(pos, 0.9 + UNITS[pick[i].kind].radius * 1.6, 1.4, 0.3 + i * stagger)
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
    const waiting = g.profile.shadows.length - this.field().length - n
    g.hud.message(waiting > 0 ? `${n} bayangan dipanggil. ${waiting} lainnya menunggu di Ruang Bayangan.` : `${n} bayangan dipanggil.`, 'umbra')
  }

  /** T again: every shadow on the field sinks into a pool and the darkness pulls back under the witch. */
  dismiss() {
    const g = this.g
    const out = this.field()
    this.calls = []
    if (!out.length) return
  }

  private spawnShadow(recordId: number, at: THREE.Vector3) {
    const g = this.g
    const rec = g.profile.shadows.find((s) => s.id === recordId)
    if (!rec) return null
    const u = g.units.spawn(rec.kind, 'shadow', rec.level, at, true)
    u.record = rec
    u.slot = g.profile.shadows.indexOf(rec)
    u.focusBonus = hasUpgrade(g.profile, 'focus') ? RITE.focusBonus : 0
    g.sfx.riteResult(true)
    g.rings.spawn(at, COLOR.umbra, 0.3, 2.5, 0.8)
    g.lights.flash(at.clone().setY(1), COLOR.umbra, 14, 8, 0.8)
    return u
  }

  /** Corpse glow, ash and clean-up; picks the corpse under the crosshair. */
  update(dt: number, canAct: boolean) {
    const g = this.g
    this.swapCd = Math.max(0, this.swapCd - dt)
    const t = performance.now() / 1000
    const open = this.riteOpen
    const cam = g.camera
    const eye = g.player.eyePos
    const fwd = g.player.viewDir()
    let best: Unit | null = null
    let bestScore = Infinity

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
        mat.emissiveIntensity = pulse * end * (u === this.casting ? 1.35 : 0.8)
        if (Math.random() < dt * 6) {
          g.glow.emit({ pos: u.pos, count: 1, color: COLOR.umbra, intensity: 2.2, life: 1.2, size: 0.12, vel: { x: 0, y: 0.9, z: 0 }, jitter: 0.5 })
        }
        const to = u.pos.clone().sub(g.player.pos)
        const dist = to.length()
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
    this.candidate = this.casting && this.casting.state === 'dead' && !this.casting.riteTried && !this.casting.ash ? this.casting : best

    // Casting.
    const holding = canAct && g.input.held('KeyR')
    if (this.casting && (!holding || this.casting.riteTried || this.casting.ash)) this.cancel()
    if (canAct && g.input.pressed('KeyR')) this.begin()
    if (this.casting) {
      const castTime = hasUpgrade(g.profile, 'rite') ? RITE.castTimeUpgraded : RITE.castTime
      this.progress += dt / castTime
      const from = g.hands.palmWorld('right', cam)
      const c = this.casting.pos
      for (let i = 0; i < 2; i++) {
        const s = Math.random()
        const p = from.clone().lerp(c, s)
        g.glow.emit({ pos: p, count: 1, color: COLOR.umbra, intensity: 2.4, life: 0.3, size: 0.1, vel: { x: (c.x - from.x) * 0.8, y: (c.y - from.y) * 0.8, z: (c.z - from.z) * 0.8 } })
      }
      g.smoke.emit({ pos: c, count: 1, color: 0x170a28, life: 1, size: 0.8, sizeEnd: 1.4, vel: { x: 0, y: 1, z: 0 }, jitter: 0.5, alpha: 0.7 })
      g.hands.gather('right', this.progress)
      this.chargeTick -= dt
      if (this.chargeTick <= 0) {
        g.sfx.riteCharge(this.progress)
        this.chargeTick = 0.12
      }
      if (this.progress >= 1) this.complete(this.casting)
    }

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
    if (this.casting === u) this.cancel()
    this.g.smoke.emit({ pos: u.pos, count: 8, color: 0x3a3436, life: 1.4, size: 0.6, sizeEnd: 1.2, speed: 0.4, vel: { x: 0, y: 0.5, z: 0 }, jitter: 0.4, alpha: 0.6 })
  }

  chance(u: Unit) {
    const g = this.g
    return riteChance(UNITS[u.kind].rank, g.profile.level, u.level, g.profile.stats.umb)
  }

  /** Why a cast on this corpse cannot start right now, or null when it can. */
  blocker(u?: Unit): string | null {
    const g = this.g
    if (!this.riteOpen) return 'Umbra Rite terbuka di Lv 2.'
    const rank = u ? riteBlock(g.profile, u.kind) : null
    if (rank) return rank
    if (g.profile.shadows.length >= g.derived.slots) return 'Slot bayangan penuh. Lepas satu di Ledger (Tab).'
    if (!g.spells.overloaded && g.player.mana < RITE.mana) return `Mana kurang: butuh ${RITE.mana}.`
    return null
  }

  private begin() {
    const g = this.g
    const u = this.candidate
    if (!u) return
    const why = this.blocker(u)
    if (why) {
      g.hud.message(why, 'umbra')
      if (why.startsWith('Mana')) g.hud.flashMana()
      return
    }
    this.casting = u
    this.progress = 0
    g.hands.pose('right', 'rite')
  }

  cancel() {
    if (!this.casting) return
    this.casting = null
    this.progress = 0
    this.g.hands.pose('right', 'idle')
  }

  /** Taking damage breaks the cast (GDD). */
  interrupt() {
    if (this.casting) {
      this.g.hud.message('Cast terputus karena kamu terkena serangan.', 'umbra')
      this.cancel()
    }
  }

  private complete(u: Unit) {
    const g = this.g
    this.casting = null
    this.progress = 0
    if (!g.spells.overloaded) g.player.mana -= RITE.mana
    u.riteTried = true
    const p = this.chance(u)
    const roll = Math.random()
    g.hands.pose('right', 'push', 0.4)
    g.hands.kick('right', 1.4)
    if (roll < p) {
      const rec = addShadow(g.profile, u.kind, u.level)
      if (!rec) {
        g.hud.message('Slot bayangan penuh. Lepas satu di Ledger (Tab).', 'umbra')
        return
      }
      const at = u.pos.clone()
      g.units.remove(u)
      const s = this.spawnShadow(rec.id, at)
      if (s) s.slot = g.profile.shadows.length - 1
      g.player.addTrauma(0.2)
      g.hud.message(`Bayangan baru: ${rec.name}, ${RANKS[rec.rank].label} dari ${UNITS[rec.kind].name} Lv ${rec.level}.`, 'umbra')
      g.hud.riteResult(true, rec.name)
      g.rift.raised.push(rec.name)
      g.saveSoon()
    } else {
      this.turnToAsh(u)
      g.sfx.riteResult(false)
      g.hud.message(`Esensi ${UNITS[u.kind].name} pudar. Peluangnya ${Math.round(p * 100)}%, dan setiap tubuh hanya bisa dicoba sekali.`, 'umbra')
      g.hud.riteResult(false, '')
    }
  }

  /** Records a fallen shadow so it does not rise again until the next Rift. */
  shadowFell(u: Unit) {
    const g = this.g
    if (u.record) {
      this.down.add(u.record.id)
      g.hud.message(`${u.record.name} tumbang. Ia kembali utuh di Rift berikutnya.`, 'umbra')
    }
    g.smoke.emit({ pos: u.pos, count: 18, color: 0x170a28, life: 1.3, size: 1, sizeEnd: 1.8, speed: 1.2, vel: { x: 0, y: 1.2, z: 0 }, jitter: 0.5, alpha: 0.8 })
    g.glow.emit({ pos: u.center, count: 20, color: COLOR.umbra, intensity: 2.4, life: 0.8, size: 0.14, speed: 2.5 })
  }

  private order(choice: WheelChoice) {
    const g = this.g
    const shadows = g.units.shadows()
    if (!shadows.length && choice !== 'swap') {
      g.hud.message('Belum ada bayangan yang berdiri di Rift ini.', 'umbra')
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
