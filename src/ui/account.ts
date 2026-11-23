// The sign-in screen, the account row on the title screen, and keeping the witch in step with the
// server. While the server runs, nobody plays without an account; when it cannot be reached the game
// still works, the witch stays in this browser, and finished Rifts wait until someone signs in.
import {
  ApiError,
  authState,
  checkAccount,
  fetchProfile,
  flushQueue,
  listRifts,
  onAuth,
  pushProfile,
  queuedRifts,
  saveRift,
  signIn,
  signOut,
  signUp,
  type AuthState,
} from '../data/api'
import type { Game } from '../engine/game'
import { isFresh, type Profile } from '../game/progression'
import { clearProfile, normalizeProfile, saveProfile } from '../game/save'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T

export interface AccountHooks {
  /** The witch changed underneath the title screen (taken from the server). */
  onProfileChanged: () => void
}

/** Returns `refresh`, for when the title screen comes back after a Rift or the Ledger. */
export function mountAccount(game: Game, hooks: AccountHooks): { refresh: () => void } {
  const gate = $<HTMLDialogElement>('auth-gate')
  const form = $<HTMLFormElement>('gate-form')
  const user = $<HTMLInputElement>('gate-user')
  const pass = $<HTMLInputElement>('gate-pass')
  const submit = $<HTMLButtonElement>('gate-submit')
  const error = $('gate-error')
  let mode: 'in' | 'up' = 'in'
  let busy = false
  // "Main tanpa akun" holds until the page reloads or the player asks to sign in.
  let skipped = false
  let shown: AuthState['status'] | null = null
  let last: AuthState['status'] = authState().status
  let pushTimer = 0
  let note = ''

  const label = (): string => (mode === 'in' ? 'Masuk' : 'Buat akun')
  function showError(text: string): void {
    error.textContent = text
    error.hidden = !text
  }

  function setMode(next: 'in' | 'up'): void {
    mode = next
    $('gate-h').textContent = next === 'in' ? 'Masuk ke Crimson Sovereign' : 'Buat akun Crimson Sovereign'
    submit.textContent = label()
    pass.autocomplete = next === 'in' ? 'current-password' : 'new-password'
    $('gate-pass-hint').hidden = next === 'in'
    $('gate-switch-text').textContent = next === 'in' ? 'Belum punya akun?' : 'Sudah punya akun?'
    $('gate-switch').textContent = next === 'in' ? 'Daftar' : 'Masuk'
    $('gate-lead').textContent =
      next === 'in'
        ? 'Level, stat, skill, Ruang Bayangan, dan riwayat Rift tersimpan di akunmu, jadi bisa dilanjutkan dari browser mana pun.'
        : 'Witch yang sudah ada di browser ini ikut masuk ke akun barumu.'
    showError('')
    user.removeAttribute('aria-invalid')
    pass.removeAttribute('aria-invalid')
  }

  /** The gate only covers the title screen; a fight in progress is never interrupted by it. */
  const onTitle = (): boolean => game.state === 'title'

  function render(state: AuthState = authState()): void {
    const offline = state.status === 'unavailable'
    const wanted = onTitle() && (state.status === 'signed-out' || (offline && !skipped) || (state.status === 'checking' && gate.open))
    $('gate-checking').hidden = state.status !== 'checking'
    form.hidden = state.status !== 'signed-out'
    $('gate-switch-line').hidden = state.status !== 'signed-out'
    $('gate-offline').hidden = !offline
    $('gate-lead').hidden = state.status !== 'signed-out'
    if (wanted && !gate.open) gate.showModal()
    else if (!wanted && gate.open) gate.close()
    // Focus moves only when what the screen asks for changes, never on every update.
    if (gate.open && shown !== state.status) {
      if (state.status === 'signed-out') user.focus()
      else if (offline) $('gate-retry').focus()
    }
    shown = gate.open ? state.status : null
