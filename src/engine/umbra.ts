import * as THREE from 'three'
import { RANKS, RITE, UNITS } from '../game/balance'
import { addShadow, hasUpgrade, isUnlocked, riteChance } from '../game/progression'
import type { Game } from './game'
import { COLOR } from './palette'
import type { Unit } from './units'

export type WheelChoice = 'follow' | 'attack' | 'hold' | 'swap'

/** Umbra Rite (raising the fallen) and orders for the shadow army. */
export class Umbra {
  private readonly g: Game
  candidate: Unit | null = null
  casting: Unit | null = null
  progress = 0
  swapCd = 0
  wheelOpen = false
  wheelChoice: WheelChoice | null = null
  private wheelX = 0
  private wheelY = 0
  private chargeTick = 0
  /** Records of shadows that fell this Rift; they come back whole next Rift. */
  readonly down = new Set<number>()

  constructor(g: Game) {
    this.g = g
  }

  reset() {
    this.candidate = null
    this.casting = null
    this.progress = 0
    this.swapCd = 0
    this.wheelOpen = false
    this.down.clear()
  }

  get riteOpen() {
    return isUnlocked(this.g.profile, 'rite')
  }

  /** Calls every saved shadow out of the Shadow Room at the start of a Rift. */
  summonAll() {
    const g = this.g
    g.profile.shadows.forEach((rec, i) => {
      window.setTimeout(() => {
        if (g.state !== 'playing' && g.state !== 'paused' && g.state !== 'ledger') return
        if (g.units.units.some((u) => u.record?.id === rec.id)) return
        const a = (i / Math.max(1, g.profile.shadows.length)) * Math.PI * 2
        const at = g.player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4))
        at.y = 0
        this.spawnShadow(rec.id, at)
      }, 600 + i * 260)
    })
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
  blocker(): string | null {
    const g = this.g
    if (!this.riteOpen) return 'Umbra Rite terbuka di Lv 2.'
    if (g.profile.shadows.length >= g.derived.slots) return 'Slot bayangan penuh. Lepas satu di Ledger (Tab).'
    if (!g.spells.overloaded && g.player.mana < RITE.mana) return `Mana kurang: butuh ${RITE.mana}.`
    return null
  }

  private begin() {
    const g = this.g
    const u = this.candidate
    if (!u) return
    const why = this.blocker()
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
