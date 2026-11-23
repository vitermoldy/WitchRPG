import * as THREE from 'three'
import { BOSS, UNITS } from '../game/balance'
import type { Game } from './game'
import { COLOR } from './palette'
import type { DamageSource, Unit } from './units'

export type BossPhase = 1 | 2 | 3

/**
 * The Hollow Warden, in three phases (GDD):
