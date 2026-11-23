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
