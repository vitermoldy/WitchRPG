import '@fontsource-variable/sora'
import '@fontsource-variable/figtree'
import '@fontsource-variable/martian-mono'
import './styles.css'
import { Game, type GameState } from './engine/game'
import { RANKS, TIERS, UNITS, type TierId } from './game/balance'
import { bossUnlocked, isFresh, newProfile, tierUnlocked } from './game/progression'
import { clearProfile } from './game/save'
import { mountAccount } from './ui/account'
import { confirmDialog } from './ui/ledger'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const screens: Record<string, HTMLElement> = {
  loading: $('screen-loading'),
  error: $('screen-error'),
  title: $('screen-start'),
  paused: $('screen-pause'),
  result: $('screen-result'),
  dead: $('screen-dead'),
}

function showScreen(name: keyof typeof screens | null) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name
}

function fail(message: string) {
  showScreen('error')
  $('error-text').textContent = message
}

function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m} menit ${r} detik`
}

async function boot() {
  if (!webglOk()) {
    fail('Browser ini tidak menyediakan WebGL 2.')
    return
  }
  const debug = new URLSearchParams(location.search).has('debug')
  let game: Game
  try {
    game = new Game($<HTMLCanvasElement>('view'), debug)
  } catch (e) {
    fail(`Renderer gagal dibuat: ${(e as Error).message}`)
    return
  }
  if (debug) (window as unknown as { __game: Game }).__game = game
  game.start()
  try {
    await game.warmUp()
  } catch (e) {
    console.error(e)
  }

  const hud = $('hud')
  const resumeHint = $('resume-hint')

  let account: { refresh: () => void } | null = null
  let pickedTier = false

  const renderTitle = () => {
    const p = game.profile
    const fresh = isFresh(p)
    $('profile-line').innerHTML = fresh
      ? '<span>Witch baru di Lv 1. Belum ada bayangan.</span>'
      : `<span>Lv <b>${p.level}</b></span><span><b>${p.shadows.length}</b> bayangan</span><span><b>${p.clears}</b> Rift ditutup</span>${
          p.statPoints || p.skillPoints ? `<span><b>${p.statPoints + p.skillPoints}</b> poin belum dipakai</span>` : ''
        }`
    $('btn-reset').hidden = fresh
    renderTiers()
    const warn = $('save-warning')
    warn.hidden = !game.saveError
    warn.textContent = game.saveError ?? ''
  }

  /** The Rift picker: what each tier holds, which are open, and which one the button enters. */
  const TIER_INFO: Record<TierId, string> = {
    1: 'Husk dan Rift Hound, Lv 1 sampai 3. Lima gelombang.',
    2: 'Ditambah Spitter yang menembak dari perancah. Lv 4 sampai 6.',
    3: 'Ditambah Warden berperisai dan Rift Lord. Lv 7 sampai 9. Di ujungnya, Jantung Rift dan The Hollow Warden.',
  }
  const renderTiers = () => {
    const p = game.profile
    if (!tierUnlocked(p, game.tier)) game.tier = 1
    for (const el of document.querySelectorAll<HTMLButtonElement>('.tier')) {
      const t = Number(el.dataset.tier) as TierId
      const open = tierUnlocked(p, t)
      el.disabled = !open
      el.setAttribute('aria-checked', String(t === game.tier))
      el.tabIndex = t === game.tier ? 0 : -1
      el.setAttribute('aria-label', open ? `Rift Tier ${TIERS[t].roman}` : `Rift Tier ${TIERS[t].roman}, terbuka di Lv ${TIERS[t].unlock}`)
      const lock = el.querySelector('.tier-lock') as HTMLElement
      lock.textContent = open ? (p.tierClears[t] ? `${p.tierClears[t]} kali ditutup` : 'Terbuka') : `Lv ${TIERS[t].unlock}`
    }
    let info = TIER_INFO[game.tier]
    if (game.tier === 3) info += bossUnlocked(p) ? (p.bossKills ? ` The Hollow Warden sudah tumbang ${p.bossKills} kali.` : '') : ` Gerbangnya terbuka di Lv ${TIERS[3].boss!.unlock}.`
    $('tier-info').textContent = info
    $('btn-enter').textContent = `Masuk Rift Tier ${TIERS[game.tier].roman}`
  }

  const renderResult = () => {
    const r = game.rift
    $('result-title').textContent = r.bossDefeated ? 'Jantung Rift ditutup' : `${r.tier.name} ditutup`
    const rows: [string, string, string?][] = [
      ['Waktu', fmtTime(r.elapsed)],
      ['Musuh dikalahkan', String(r.kills)],
      ['XP didapat', String(r.xpGained)],
      ['Level sekarang', `Lv ${game.profile.level}${r.levelsGained ? `, naik ${r.levelsGained}` : ''}`],
      ['Pasukan bayangan', game.profile.shadows.length ? game.profile.shadows.map((s) => `${s.name} (${RANKS[s.rank].label}, ${UNITS[s.kind].name})`).join(', ') : 'Belum ada', 'umbra'],
    ]
    $('result-list').innerHTML = rows.map(([a, b, c]) => `<dt>${a}</dt><dd${c ? ` class="${c}"` : ''}>${b}</dd>`).join('')
    const pts = game.profile.statPoints + game.profile.skillPoints
    $('btn-result-ledger').textContent = pts ? `Bagikan ${pts} poin di Ledger` : 'Buka Ledger'
  }

  const renderPause = () => {
    const s = game.profile.settings
    $<HTMLInputElement>('set-sens').value = String(s.sensitivity)
    $('out-sens').textContent = s.sensitivity.toFixed(2)
    $<HTMLInputElement>('set-vol').value = String(s.volume)
    $('out-vol').textContent = `${Math.round(s.volume * 100)}%`
    $<HTMLInputElement>('set-bob').checked = s.headBob
    $<HTMLInputElement>('set-shake').checked = s.shake
  }

  game.onState = (s: GameState) => {
    hud.hidden = !(s === 'playing' || s === 'paused' || s === 'ledger')
    resumeHint.hidden = true
    if (s === 'title') {
      renderTitle()
      account?.refresh()
      showScreen('title')
      $('btn-enter').focus()
    } else if (s === 'playing' || s === 'ledger') showScreen(null)
    else if (s === 'paused') {
      renderPause()
      showScreen('paused')
      $('btn-resume').focus()
    } else if (s === 'result') {
      renderResult()
      showScreen('result')
      $('btn-result-ledger').focus()
    } else if (s === 'dead') {
      $('dead-text').textContent = `XP dan bayangan yang sudah didapat tetap tersimpan (Lv ${game.profile.level}). Rift harus diulang dari gelombang pertama.`
      showScreen('dead')
      $('btn-retry').focus()
    }
  }

  // Title.
  $('btn-enter').addEventListener('click', () => void game.enterRift())
  $('btn-ledger-start').addEventListener('click', () => {
    game.sfx.start()
    game.openLedger('title')
  })
  $('btn-reset').addEventListener('click', async () => {
    const ok = await confirmDialog('Hapus semua progres?', 'Level, stat, skill, dan semua bayangan di Ruang Bayangan akan hilang. Pengaturan kontrol tetap.', 'Hapus progres')
    if (!ok) return
    const settings = game.profile.settings
    clearProfile()
    const fresh = newProfile()
    fresh.settings = settings
    Object.assign(game.profile, fresh)
    game.persist()
    game.applyStats(true)
    renderTitle()
  })

  // Pause.
  $('btn-resume').addEventListener('click', () => void game.resume())
  $('btn-ledger-pause').addEventListener('click', () => game.openLedger('paused'))
  $('btn-leave').addEventListener('click', async () => {
    const ok = await confirmDialog('Tinggalkan Rift?', 'XP dan bayangan yang sudah didapat tetap tersimpan. Gelombang di Rift ini harus diulang dari awal.', 'Tinggalkan Rift')
    if (ok) game.leaveRift()
    else $('btn-resume').focus()
  })
  $<HTMLInputElement>('set-sens').addEventListener('input', (e) => {
    game.profile.settings.sensitivity = Number((e.target as HTMLInputElement).value)
    $('out-sens').textContent = game.profile.settings.sensitivity.toFixed(2)
    game.saveSoon()
  })
  $<HTMLInputElement>('set-vol').addEventListener('input', (e) => {
    game.profile.settings.volume = Number((e.target as HTMLInputElement).value)
    $('out-vol').textContent = `${Math.round(game.profile.settings.volume * 100)}%`
    game.applySettings()
    game.saveSoon()
  })
  $<HTMLInputElement>('set-bob').addEventListener('change', (e) => {
    game.profile.settings.headBob = (e.target as HTMLInputElement).checked
    game.saveSoon()
  })
  $<HTMLInputElement>('set-shake').addEventListener('change', (e) => {
    game.profile.settings.shake = (e.target as HTMLInputElement).checked
    game.saveSoon()
  })

  // After a Rift or a fall.
  $('btn-result-ledger').addEventListener('click', () => game.openLedger('result'))
  $('btn-again').addEventListener('click', () => void game.enterRift())
  $('btn-title').addEventListener('click', () => game.setState('title'))
  $('btn-retry').addEventListener('click', () => void game.enterRift())
  $('btn-dead-title').addEventListener('click', () => {
    game.leaveRift()
  })
  $('btn-click-resume').addEventListener('click', () => void game.resume())

  // Escape inside the Ledger closes it natively; returning to the fight then needs a click.
  document.addEventListener('pointerlockerror', () => {
    if (game.state === 'paused') {
      showScreen('paused')
    }
  })

  game.setState('title')
  account = mountAccount(game, { onProfileChanged: renderTitle })
}

void boot()
