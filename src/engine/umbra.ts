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
