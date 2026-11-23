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
