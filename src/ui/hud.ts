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

  /** A violet breath across the screen when the army is called. */
  umbraPulse() {
    const el = $('umbra-veil')
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
  }

  /** Open world: the region line, the nearest camp, and the compass. */
  private updateWorld() {
    const g = this.g
    const w = g.worldDir
    const near = w.nearestCamp()
    this.set('rift-name', 'text', 'Dunia terbuka')
    this.set('rift-wave', 'text', near ? `Kamp Lv ${near.camp.spot.levels[0]} sampai ${near.camp.spot.levels[1]}${near.camp.spot.elite ? ', dengan Rift Lord' : ''}` : 'Semua kamp ditaklukkan')
    this.set('rift-left', 'text', near ? `${Math.round(near.dist)} m, ${w.cleared} dari ${w.camps.length} kamp ditaklukkan` : '')
    this.updateCompass()
  }

  private readonly compassMarks: HTMLElement[] = []

  private updateCompass() {
    const g = this.g
    const box = $('compass')
    const p = g.player
    const span = 110 * (Math.PI / 180)
    const width = box.clientWidth || 420
    const marks: { label: string; cls: string; x: number; z: number }[] = [
      { label: 'U', cls: 'cm-cardinal', x: p.pos.x, z: p.pos.z - 1000 },
      { label: 'T', cls: 'cm-cardinal', x: p.pos.x + 1000, z: p.pos.z },
      { label: 'S', cls: 'cm-cardinal', x: p.pos.x, z: p.pos.z + 1000 },
      { label: 'B', cls: 'cm-cardinal', x: p.pos.x - 1000, z: p.pos.z },
    ]
    // The altar is left off while she stands at it, where its bearing is meaningless.
    if (!g.worldDir.nearAltar()) marks.push({ label: 'Altar', cls: 'cm-altar', x: g.ow.altar.x, z: g.ow.altar.z })
    for (const gt of g.ow.gates) marks.push({ label: `Rift ${['I', 'II', 'III'][gt.tier - 1]}`, cls: 'cm-gate', x: gt.pos.x, z: gt.pos.z })
    for (const c of g.worldDir.camps) {
      if (c.state === 'cleared') continue
      const lv = c.spot.levels[1]
      marks.push({ label: '', cls: `cm-camp ${lv > g.profile.level + 2 ? 'hard' : lv < g.profile.level - 2 ? 'easy' : 'even'}`, x: c.spot.pos.x, z: c.spot.pos.z })
    }
    while (this.compassMarks.length < marks.length) {
      const el = document.createElement('span')
      box.appendChild(el)
      this.compassMarks.push(el)
    }
    marks.forEach((m, i) => {
      const el = this.compassMarks[i]
      const bearing = Math.atan2(-(m.x - p.pos.x), -(m.z - p.pos.z))
      let d = bearing - p.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const shown = Math.abs(d) < span / 2
      el.hidden = !shown
      if (!shown) return
      el.className = `cm ${m.cls}`
      if (el.textContent !== m.label) el.textContent = m.label
      el.style.transform = `translateX(${(-d / span + 0.5) * width}px)`
    })
    for (let i = marks.length; i < this.compassMarks.length; i++) this.compassMarks[i].hidden = true
  }

  /** A short black fade, for stepping through the gate into the lair. */
  fade() {
    const el = $('fade')
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
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
    this.set('rite-ring', 'dash', `${(g.umbra.progress * 100).toFixed(1)} 100`)
    this.root.classList.toggle('overloaded', g.spells.overloaded)

    // Rift status, or where things are in the open world.
    const r = g.rift
    this.root.classList.toggle('world', g.mode === 'world')
    if (g.mode === 'world') this.updateWorld()
    else this.set('rift-name', 'text', g.inLair ? 'Jantung Rift' : r.tier.name)
    if (g.mode === 'rift') this.set(
      'rift-wave',
      'text',
      r.phase === 'intro' ? 'Rift terbuka' : r.phase === 'cleared' ? 'Rift ditaklukkan' : r.phase === 'gate' ? 'Jantung Rift terbuka' : r.phase === 'lair' ? 'The Hollow Warden' : `Gelombang ${r.wave} dari ${r.totalWaves}`,
    )
    this.set(
      'rift-left',
      'text',
      r.phase === 'wave'
        ? `${r.remaining} musuh tersisa`
        : r.phase === 'breather'
          ? 'Jeda antar gelombang'
          : r.phase === 'cleared'
            ? g.inLair
              ? 'Keluar lewat retakan di pilar tengah'
              : 'Keluar lewat retakan di monumen'
            : r.phase === 'gate'
              ? 'Masuk lewat retakan merah di monumen'
              : '',
    )
    this.updateBossBar()
    this.set('stamina-label', 'text', p.flying ? 'Terbang' : 'Stamina')

    // Skills.
    const cds = g.spells.cooldowns()
    const skill = (id: string, unlock: number, cd: number) => {
      const locked = pr.level < unlock
      this.set(id, 'class', `skill${locked ? ' locked' : ''}`)
      const el = $(id).querySelector('.cd') as HTMLElement
      const v = `scaleY(${locked ? 0 : cd.toFixed(3)})`
      if (el.style.transform !== v) el.style.transform = v
    }
    skill('sk-burst', 3, cds.burst)
    skill('sk-snare', 5, cds.snare)
    skill('sk-barrier', 7, cds.barrier)
    skill('sk-warp', 10, cds.warp)
    const full = g.spells.chaos >= CHAOS.max
    this.set('sk-overload', 'class', `skill skill-overload${full || g.spells.overloaded ? ' ready-full' : ''}`)
    const ocd = $('sk-overload').querySelector('.cd') as HTMLElement
    const ov = `scaleY(${g.spells.overloaded ? 0 : (1 - g.spells.chaos / CHAOS.max).toFixed(3)})`
    if (ocd.style.transform !== ov) ocd.style.transform = ov

    // Prompt under the crosshair.
    let promptHtml = ''
    const c = g.umbra.candidate
    const many = g.umbra.targets.length
    const gate = g.mode === 'world' ? g.worldDir.nearGate() : null
    if (g.mode === 'rift' && g.rift.nearExit()) promptHtml = '<kbd>F</kbd> Keluar dari Rift'
    else if (g.mode === 'rift' && g.rift.nearGate()) promptHtml = '<kbd>F</kbd> Masuk ke Jantung Rift'
    else if (gate) {
      const gp = g.worldDir.gatePrompt(gate)
      promptHtml = gp.ok ? `<kbd>F</kbd> ${gp.text}` : `<span class="blocked">${gp.text}</span>`
    } else if (c && many >= 2) {
      const why = g.umbra.blocker(undefined, many)
      const chances = g.umbra.targets.map((u) => Math.round(g.umbra.chance(u) * 100))
      const lo = Math.min(...chances)
      const hi = Math.max(...chances)
      if (why) promptHtml = `<span class="blocked">${why}</span>`
      else if (g.umbra.casting.length) promptHtml = `Membangkitkan ${g.umbra.casting.length} tubuh`
      else promptHtml = `<kbd>Tahan R</kbd> Bangkitkan ${many} tubuh <span class="chance">${lo === hi ? `${lo}%` : `${lo} sampai ${hi}%`}</span> <span class="num">mana ${g.umbra.cost(many)}</span>`
    } else if (c) {
      const why = g.umbra.blocker(c)
      const name = `${UNITS[c.kind].name} Lv ${c.level}`
      if (why) promptHtml = `<span class="blocked">${why}</span>`
      else if (g.umbra.casting.length) promptHtml = `Membangkitkan ${name}`
      else promptHtml = `<kbd>Tahan R</kbd> Bangkitkan ${name} <span class="chance">${Math.round(g.umbra.chance(c) * 100)}%</span>`
    } else if (g.mode === 'world' && g.worldDir.nearAltar() && (p.hp < p.maxHp || p.mana < p.maxMana)) promptHtml = 'Altar memulihkan HP dan mana'
    if (this.cache.get('prompt') !== promptHtml) {
      this.cache.set('prompt', promptHtml)
      this.prompt.innerHTML = promptHtml
    }

    this.updateArmy()
    this.updateWheel()
    this.updateBars()
  }

  private updateBossBar() {
    const u = this.g.rift.bossUnit
    const show = !!u && u.alive
    this.set('bossbar', 'class', show ? 'bossbar on' : 'bossbar')
    if (!show || !u) return
    this.set('boss-name', 'text', u.spec.name)
    this.set('boss-fill', 'transform', `scaleX(${Math.max(0, u.hp / u.maxHp).toFixed(3)})`)
    const boss = this.g.rift.boss
    this.set('boss-phase', 'text', boss && boss.u === u ? boss.label : u.kind === 'riftlord' ? 'Memanggil husk dan menghantam tanah. Keluar dari lingkaran amber.' : '')
  }

  /** A summary that stays the same size whether the army is three shadows or three hundred. */
  private updateArmy() {
    const g = this.g
    const slots = g.derived.slots
    const live = new Map(g.units.shadows().map((u) => [u.record?.id, u]))
    const rows: string[] = []
    // Every raised shadow gets a row; empty slots share one line so a big army stays compact.
    const empty = Math.max(0, slots - g.profile.shadows.length)
    for (let i = 0; i < g.profile.shadows.length; i++) {
      const rec = g.profile.shadows[i]
      const u = live.get(rec.id)
      const down = g.umbra.down.has(rec.id)
      const cls = down ? 'down' : u ? 'up' : ''
      const hp = u ? Math.max(0, u.hp / u.maxHp) : 0
      rows.push(
        `<li class="army-slot ${cls}"><span class="pip"></span><span>${rec.name} <span class="num">Lv ${rec.level}</span></span>${
          down ? '<span class="num">tumbang</span>' : `<span class="hp"><i style="transform:scaleX(${hp.toFixed(2)})"></i></span>`
        }</li>`,
      )
    }
    if (empty) rows.push(`<li class="army-slot empty"><span class="pip"></span><span>${empty} slot kosong</span><span></span></li>`)
    const html = rows.join('')
    if (this.cache.get('army') !== html) {
      this.cache.set('army', html)
      this.slots.innerHTML = html
    }
    const first = g.units.shadows()[0]
    const order = !first ? 'Tanpa pasukan' : first.command === 'attack' ? 'Serang' : first.command === 'hold' ? 'Tahan' : 'Ikuti'
    this.set('army-order', 'text', order)
  }

  private updateWheel() {
    const u = this.g.umbra
    this.wheel.hidden = !u.wheelOpen
    if (!u.wheelOpen) return
    const swapLocked = this.g.profile.level < 4
    for (const el of this.wheel.querySelectorAll<HTMLElement>('.wheel-opt')) {
      const opt = el.dataset.opt
      el.classList.toggle('on', opt === u.wheelChoice)
      if (opt === 'swap') {
        el.classList.toggle('locked', swapLocked)
        el.textContent = swapLocked ? 'Tukar Tempat (Lv 4)' : u.swapCd > 0 ? `Tukar Tempat ${Math.ceil(u.swapCd)} dtk` : 'Tukar Tempat'
      }
    }
  }

  private updateBars() {
    const g = this.g
    const cam = g.camera
    const w = window.innerWidth
    const h = window.innerHeight
    let n = 0
    for (const u of g.units.units) {
      if (u.team !== 'rift' || !u.alive || u.barShown <= 0) continue
      this.v.set(u.pos.x, u.pos.y + u.height + 0.35, u.pos.z).project(cam)
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue
      let el = this.pool[n]
      if (!el) {
        el = document.createElement('div')
        el.className = 'hpbar'
        el.appendChild(document.createElement('i'))
        this.bars.appendChild(el)
        this.pool.push(el)
      }
      el.hidden = false
      el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px)`
      const k = Math.max(0, u.hp / u.maxHp)
      ;(el.firstChild as HTMLElement).style.transform = `scaleX(${k.toFixed(3)})`
      el.classList.toggle('weak', u.vulnerable > 0)
      n++
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].hidden = true
  }
}
