import { RANKS, UNITS } from '../game/balance'
import { buyUpgrade, canUpgrade, derive, isUnlocked, releaseShadow, spendStat, STAT_KEYS, xpToNext, type StatKey } from '../game/progression'
import { SKILLS } from '../game/skills'

import type { Profile } from '../game/progression'

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
