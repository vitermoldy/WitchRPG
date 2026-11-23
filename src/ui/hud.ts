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
    this.cache.set(k, value)
    const el = $(id)
    if (key === 'text') el.textContent = value
    else if (key === 'transform') el.style.transform = value
    else if (key === 'dash') el.style.strokeDasharray = value
    else el.className = value
  }

  message(text: string, tone: Tone = 'info') {
    const p = document.createElement('p')
    p.className = `feed-item ${tone}`
    p.textContent = text
    this.feed.appendChild(p)
    while (this.feed.children.length > 5) this.feed.firstElementChild?.remove()
    window.setTimeout(() => p.classList.add('fade'), 5200)
    window.setTimeout(() => p.remove(), 5900)
  }

  banner(title: string, sub: string) {
    ;(this.bannerEl.querySelector('.banner-title') as HTMLElement).textContent = title
    ;(this.bannerEl.querySelector('.banner-sub') as HTMLElement).textContent = sub
    this.bannerEl.classList.add('show')
    this.bannerTimer = 3.2
  }

  flashMana() {
    this.manaFlash = 0.6
  }

  hurtFlash(k: number) {
    this.hurt = Math.min(1, this.hurt + k)
  }

  hit(kill: boolean) {
    this.hitTimer = kill ? 0.25 : 0.1
    this.hitmark.setAttribute('class', kill ? 'hitmark kill' : 'hitmark on')
  }

  riteResult(ok: boolean, name: string) {
    if (ok) this.banner(name, 'bangkit dari bayangan dan berdiri di sisimu')
  }

  clearFeed() {
    this.feed.replaceChildren()
    this.bannerEl.classList.remove('show')
  }

