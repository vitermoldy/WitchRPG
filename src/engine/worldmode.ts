import * as THREE from 'three'
import { TIERS, UNITS, type UnitKind } from '../game/balance'
import { tierUnlocked } from '../game/progression'
import type { Game } from './game'
import type { CampSpot, Gate } from './openworld'
import { COLOR } from './palette'
import type { Unit } from './units'

interface Camp {
  spot: CampSpot
  state: 'idle' | 'active' | 'cleared'
