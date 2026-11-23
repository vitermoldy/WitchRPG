import '@fontsource-variable/sora'
import '@fontsource-variable/figtree'
import '@fontsource-variable/martian-mono'
import './styles.css'
import { Game, type GameState } from './engine/game'
import { RANKS, UNITS } from './game/balance'
import { newProfile } from './game/progression'
import { clearProfile, saveProfile } from './game/save'
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

  const renderTitle = () => {
    const p = game.profile
    const base = newProfile()
    const fresh =
      p.level === 1 &&
      p.xp === 0 &&
      p.shadows.length === 0 &&
      p.clears === 0 &&
      p.statPoints === 0 &&
      p.skillPoints === 0 &&
      Object.keys(p.upgrades).length === 0 &&
      Object.entries(p.stats).every(([k, v]) => base.stats[k as keyof typeof base.stats] === v)
    $('profile-line').innerHTML = fresh
      ? '<span>Witch baru di Lv 1. Belum ada bayangan.</span>'
      : `<span>Lv <b>${p.level}</b></span><span><b>${p.shadows.length}</b> bayangan</span><span><b>${p.clears}</b> Rift ditutup</span>${
          p.statPoints || p.skillPoints ? `<span><b>${p.statPoints + p.skillPoints}</b> poin belum dipakai</span>` : ''
        }`
    $('btn-reset').hidden = fresh
    const warn = $('save-warning')
    warn.hidden = !game.saveError
    warn.textContent = game.saveError ?? ''
  }

  const renderResult = () => {
    const r = game.rift
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
      showScreen('title')
      $('btn-enter').focus()
    } else if (s === 'playing' || s === 'ledger') showScreen(null)
    else if (s === 'paused') {
