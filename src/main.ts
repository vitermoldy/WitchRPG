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
