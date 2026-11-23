import * as THREE from 'three'
import { CHAOS, UNITS } from '../game/balance'
import { xpToNext } from '../game/progression'
import type { Game } from '../engine/game'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

type Tone = 'info' | 'chaos' | 'umbra' | 'level'

/** The in-fight overlay. Writes to the DOM only when a value changes. */
export class Hud {
  private readonly g: Game
  private readonly root = $('hud')
  private readonly feed = $('feed')
  private readonly bannerEl = $('banner')
  private readonly prompt = $('prompt')
  private readonly chaosRing = $('chaos-ring') as unknown as SVGCircleElement
  private readonly hitmark = $('hitmark') as unknown as SVGGElement
  private readonly bars = $('hpbars')
  private readonly wheel = $('wheel')
  private readonly slots = $('army-slots')
  private readonly hurtVeil = $('hurt-veil')
  private readonly cache = new Map<string, string>()
  private bannerTimer = 0
  private hitTimer = 0
  private hurt = 0
  private manaFlash = 0
  private readonly pool: HTMLDivElement[] = []
  private readonly v = new THREE.Vector3()

  constructor(g: Game) {
    this.g = g
  }

  show(on: boolean) {
    this.root.hidden = !on
  }

  private set(id: string, key: 'text' | 'transform' | 'class' | 'dash', value: string) {
    const k = id + key
    if (this.cache.get(k) === value) return
