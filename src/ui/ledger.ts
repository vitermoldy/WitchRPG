import { RANKS, UNITS } from '../game/balance'
import { buyUpgrade, canUpgrade, derive, isUnlocked, releaseShadow, spendStat, STAT_KEYS, xpToNext, type StatKey } from '../game/progression'
import { SKILLS } from '../game/skills'
import type { Profile } from '../game/progression'
import type { SavedRift } from '../data/api'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const STAT_INFO: Record<StatKey, { name: string; effect: string }> = {
  hex: { name: 'Hex', effect: '+2% damage sihir Chaos' },
  spr: { name: 'Spirit', effect: '+5 mana maks, regen lebih cepat' },
  vit: { name: 'Vitality', effect: '+10 HP maks' },
  agi: { name: 'Agility', effect: '+1% gerak, +0,1 dtk melayang' },
  umb: { name: 'Umbra', effect: '+1% peluang rite, +1 slot tiap 5' },
}

const fmt = (n: number, d = 0) => n.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d })

/** Ask once before something that cannot be undone. */
export function confirmDialog(title: string, text: string, yes: string): Promise<boolean> {
  const dlg = $<HTMLDialogElement>('confirm')
  $('confirm-title').textContent = title
  $('confirm-text').textContent = text
  $('confirm-yes').textContent = yes
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      $('confirm-yes').onclick = null
      $('confirm-no').onclick = null
      dlg.onclose = null
      if (dlg.open) dlg.close()
      resolve(v)
    }
    $('confirm-yes').onclick = () => done(true)
    $('confirm-no').onclick = () => done(false)
    dlg.onclose = () => done(false)
    dlg.showModal()
    $('confirm-no').focus()
  })
}

export interface LedgerHost {
  profile: Profile
  /** Called after any change so the game can refresh derived stats and save. */
  changed(): void
  sfxUi(): void
  /** Shadows that are standing in the current Rift, by record id. */
  liveShadows(): Set<number>
  /** The account's latest Rifts, or null when nobody is signed in. */
  history(): Promise<SavedRift[] | null>
}

const RESULT: Record<SavedRift['result'], string> = { cleared: 'Ditutup', fallen: 'Tumbang', left: 'Ditinggalkan' }

function duration(s: number): string {
  const m = Math.floor(s / 60)
  return m ? `${m} menit ${s % 60} detik` : `${s} detik`
}

/** Status, stats, skill tree and the Shadow Room. */
export class Ledger {
  private readonly dlg = $<HTMLDialogElement>('ledger')
  private readonly host: LedgerHost
  onClose: (() => void) | null = null

  constructor(host: LedgerHost) {
    this.host = host
    $('btn-ledger-close').addEventListener('click', () => this.close())
    this.dlg.addEventListener('close', () => this.onClose?.())
    this.dlg.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button')
      if (!t) return
      const p = this.host.profile
      if (t.dataset.stat) {
        if (spendStat(p, t.dataset.stat as StatKey)) this.after(t.dataset.stat)
      } else if (t.dataset.upgrade) {
        if (buyUpgrade(p, t.dataset.upgrade as never)) this.after('up-' + t.dataset.upgrade)
      } else if (t.dataset.release) {
        const id = Number(t.dataset.release)
        const rec = p.shadows.find((s) => s.id === id)
        if (!rec) return
        void confirmDialog(`Lepas ${rec.name}?`, `${rec.name} kembali menjadi debu dan slotnya kosong. Bayangan yang dilepas tidak bisa dipanggil lagi.`, 'Lepas bayangan').then((ok) => {
          if (ok && releaseShadow(p, id)) this.after()
          if (!this.dlg.open) this.dlg.showModal()
        })
      }
    })
  }

  get isOpen() {
    return this.dlg.open
  }

  open() {
    this.render()
    void this.renderHistory()
    if (!this.dlg.open) this.dlg.showModal()
    $('btn-ledger-close').focus()
  }

  private async renderHistory() {
    const box = $('history-body')
    box.innerHTML = '<p class="room-empty">Memuat riwayat Rift...</p>'
    let runs: SavedRift[] | null
    try {
      runs = await this.host.history()
    } catch {
      box.innerHTML = '<p class="room-empty">Riwayat belum bisa dimuat dari server. Witch dan progresmu tetap aman di browser ini.</p>'
      return
    }
    if (runs === null) {
      box.innerHTML = '<p class="room-empty">Masuk dengan akun untuk mencatat dan melihat riwayat Rift.</p>'
      return
    }
    if (!runs.length) {
      box.innerHTML = '<p class="room-empty">Belum ada Rift yang tercatat. Setiap Rift yang ditutup, membuatmu tumbang, atau kamu tinggalkan masuk ke sini.</p>'
      return
    }
    box.innerHTML = `<ol class="history-list">${runs
      .map(
        (r) => `<li class="history-item ${r.result}">
  close() {
    if (this.dlg.open) this.dlg.close()
  }

  private after(focusKey?: string) {
    this.host.sfxUi()
    this.host.changed()
    this.render()
    // Keep keyboard focus on the control that was used, or the next useful one.
    if (focusKey) {
      const sel = focusKey.startsWith('up-') ? `[data-upgrade="${focusKey.slice(3)}"]` : `[data-stat="${focusKey}"]`
      const el = this.dlg.querySelector<HTMLButtonElement>(sel)
      if (el && !el.disabled) el.focus()
      else $('btn-ledger-close').focus()
    }
  }

  render() {
    const p = this.host.profile
    const d = derive(p.stats)
    const need = xpToNext(p.level)
    $('ledger-lv').textContent = `Lv ${p.level}`
    $('ledger-xp-fill').style.transform = `scaleX(${Math.min(1, p.xp / need).toFixed(3)})`
    $('ledger-xp-text').textContent = `${fmt(p.xp)} / ${fmt(need)} XP`
    $('stat-points').textContent = p.statPoints ? `${p.statPoints} poin bebas` : 'tidak ada poin'
    $('skill-points').textContent = p.skillPoints ? `${p.skillPoints} poin skill` : 'tidak ada poin'

    $('stat-list').innerHTML = STAT_KEYS.map((k) => {
      const info = STAT_INFO[k]
      return `<li class="stat">
        <span class="stat-name"><b>${info.name}</b><small>${info.effect}</small></span>
        <span class="stat-val num">${p.stats[k]}</span>
        <button class="btn btn-small" type="button" data-stat="${k}" ${p.statPoints > 0 ? '' : 'disabled'} aria-label="Tambah 1 poin ke ${info.name}">+</button>
      </li>`
    }).join('')

    $('derived-list').innerHTML = [
      ['HP maksimum', fmt(d.maxHp)],
      ['Mana maksimum', fmt(d.maxMana)],
      ['Regen mana', `${fmt(d.manaRegen, 1)} per detik`],
      ['Damage Chaos', `${fmt(d.damageMult * 100)}%`],
      ['Waktu melayang', `${fmt(d.floatTime, 1)} detik`],
      ['Slot bayangan', fmt(d.slots)],
    ]
      .map(([a, b]) => `<dt>${a}</dt><dd class="num">${b}</dd>`)
      .join('')

    for (const branch of ['chaos', 'umbra'] as const) {
      $(`tree-${branch}`).innerHTML = SKILLS.filter((s) => s.branch === branch)
        .map((s) => {
          const open = isUnlocked(p, s.id)
          const bought = !!p.upgrades[s.id]
          let up = ''
          if (!s.built) up = `<p class="node-up">Belum ada di prototype ini</p>`
          else if (bought) up = `<p class="node-up bought">Upgrade terpasang: ${s.upgrade}</p>`
          else
            up = `<p class="node-up"><span>Upgrade: ${s.upgrade}</span><button class="btn btn-small ${branch === 'umbra' ? 'btn-umbra' : ''}" type="button" data-upgrade="${s.id}" ${
              canUpgrade(p, s.id) ? '' : 'disabled'
            }>Pakai 1 poin</button></p>`
          return `<li class="node ${open ? 'open' : 'locked'}">
            <p class="node-name">${s.name}<kbd>${s.key}</kbd></p>
            <p class="node-meta">${open ? 'Terbuka' : `Lv ${s.unlock}`}</p>
            <p class="node-effect">${s.effect}</p>
            ${up}
          </li>`
        })
        .join('')
    }

    const live = this.host.liveShadows()
    $('room-count').textContent = `${p.shadows.length} dari ${d.slots} slot`
    $('room-list').innerHTML = p.shadows.length
      ? p.shadows
          .map(
            (s) => `<li class="room-item">
          <p class="room-name">${s.name}</p>
          <p class="room-meta">${RANKS[s.rank].label} dari ${UNITS[s.kind].name}, Lv ${s.level}${live.has(s.id) ? ', sedang bertarung' : ''}</p>
          <button class="btn btn-small" type="button" data-release="${s.id}" aria-label="Lepas ${s.name}">Lepas</button>
        </li>`,
          )
          .join('')
      : `<li class="room-empty">${
          isUnlocked(p, 'rite')
            ? 'Belum ada bayangan. Kalahkan musuh, bidik tubuhnya yang bersinar ungu, lalu tahan R.'
            : 'Belum ada bayangan. Umbra Rite terbuka di Lv 2: setelah itu tubuh musuh yang kalah bisa dibangkitkan.'
        }</li>`
  }
}
