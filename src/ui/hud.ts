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

  update(dt: number) {
    const g = this.g
    const p = g.player
    const pr = g.profile
    this.bannerTimer -= dt
    if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show')
    this.hitTimer -= dt
    if (this.hitTimer <= 0) this.hitmark.setAttribute('class', 'hitmark')
    this.hurt = Math.max(0, this.hurt - dt * 1.4)
    this.hurtVeil.style.opacity = String(this.hurt)
    this.manaFlash = Math.max(0, this.manaFlash - dt)

    this.set('hp-fill', 'transform', `scaleX(${Math.max(0, p.hp / p.maxHp).toFixed(3)})`)
    this.set('hp-text', 'text', `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`)
    this.set('mana-fill', 'transform', `scaleX(${Math.max(0, p.mana / p.maxMana).toFixed(3)})`)
    this.set('mana-text', 'text', g.spells.overloaded ? 'bebas' : `${Math.floor(p.mana)} / ${p.maxMana}`)
    this.set('mana-row', 'class', this.manaFlash > 0 ? 'vital short' : 'vital')
    this.set('stamina-fill', 'transform', `scaleX(${(p.stamina / 100).toFixed(3)})`)
    this.set('level-text', 'text', `Lv ${pr.level}`)
    this.set('xp-fill', 'transform', `scaleX(${Math.min(1, pr.xp / xpToNext(pr.level)).toFixed(3)})`)

    const chaos = g.spells.overloaded ? (g.spells.overloadT / CHAOS.overloadTime) * 100 : g.spells.chaos
    this.set('chaos-ring', 'dash', `${chaos.toFixed(1)} 100`)
    this.chaosRing.classList.toggle('full', g.spells.chaos >= CHAOS.max || g.spells.overloaded)
