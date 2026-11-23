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
    renderRow(state)
    if (state.status === 'signed-in' && last !== 'signed-in') void sync()
    last = state.status
  }

  function renderRow(state: AuthState = authState()): void {
    const text = $('account-text')
    const button = $<HTMLButtonElement>('btn-account')
    if (state.status === 'signed-in' && state.account) {
      text.innerHTML = ''
      text.append('Masuk sebagai ')
      const b = document.createElement('b')
      b.textContent = state.account.username
      text.append(b, note ? `. ${note}` : '.')
      button.textContent = 'Keluar'
      button.hidden = false
    } else if (state.status === 'checking') {
      text.textContent = 'Memeriksa akun...'
      button.hidden = true
    } else {
      text.textContent =
        state.status === 'unavailable'
          ? 'Server mati, jadi progres hanya tersimpan di browser ini.'
          : 'Belum masuk. Progres hanya tersimpan di browser ini.'
      button.textContent = 'Masuk'
      button.hidden = false
    }
  }

  function setNote(text: string): void {
    note = text
    renderRow()
  }

  /** Puts a witch from the server in place of the one in this browser. */
  function adopt(remote: Profile): void {
    const p = normalizeProfile(remote)
    if (!p) return
    for (const k of Object.keys(game.profile) as (keyof Profile)[]) if (!(k in p)) delete game.profile[k]
    Object.assign(game.profile, p)
    saveProfile(game.profile, false)
    game.applyStats(true)
    game.applySettings()
    hooks.onProfileChanged()
  }

  /** After signing in: the newer witch wins, whichever side has it. */
  async function sync(): Promise<void> {
    try {
      const remote = await fetchProfile()
      const local = game.profile
      const remoteTime = remote?.updatedAt ? Date.parse(remote.updatedAt) : 0
      const localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0
      if (remote && (isFresh(local) || remoteTime > localTime)) {
        adopt(remote)
        setNote(`Witch Lv ${remote.level} dimuat dari server`)
      } else {
        const r = await pushProfile(local)
        if (r.stale && r.profile) adopt(r.profile)
        setNote(remote ? 'Progres di browser ini lebih baru dan sudah dikirim' : 'Witch di browser ini sekarang milik akunmu')
      }
      await flushQueue()
    } catch (e) {
      setNote(e instanceof ApiError ? `Sinkron gagal: ${e.message}` : 'Sinkron gagal')
    }
  }

  /** Every local save also goes to the server, a moment later so quick changes travel together. */
  function schedulePush(): void {
    if (authState().status !== 'signed-in') return
    window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(async () => {
      try {
        const r = await pushProfile(game.profile)
        // Another browser saved a newer witch; take it only when no Rift is running.
        if (r.stale && r.profile && onTitle()) adopt(r.profile)
      } catch {
        /* the browser keeps the save; the next one tries again */
      }
    }, 1200)
  }

  game.onSaved = schedulePush
  game.onRiftEnd = (run) => void saveRift(run)
  game.historySource = async () => (authState().status === 'signed-in' ? await listRifts() : null)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy) return
    showError('')
    const name = user.value.trim()
    const password = pass.value
    user.toggleAttribute('aria-invalid', !name)
    pass.toggleAttribute('aria-invalid', !password)
    if (!name || !password) {
      showError(!name ? 'Isi username dulu.' : 'Isi kata sandi dulu.')
      ;(!name ? user : pass).focus()
      return
    }
    busy = true
    submit.disabled = true
    submit.textContent = mode === 'in' ? 'Memeriksa...' : 'Membuat akun...'
    try {
      if (mode === 'in') await signIn(name, password)
      else await signUp(name, password)
      pass.value = ''
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Belum bisa masuk. Coba lagi.')
      if (e instanceof ApiError && e.status === 401) pass.select()
      pass.setAttribute('aria-invalid', 'true')
    } finally {
      busy = false
      submit.disabled = false
      submit.textContent = label()
    }
  })

  $('gate-switch').addEventListener('click', () => {
    setMode(mode === 'in' ? 'up' : 'in')
    user.focus()
  })

  // A required sign-in has no "close": Escape does nothing while the server waits for a password,
  // and means "Main tanpa akun" when the server is down.
  gate.addEventListener('cancel', (event) => {
    event.preventDefault()
    if (authState().status === 'unavailable') skip()
  })

  function skip(): void {
    skipped = true
    render()
    $('btn-enter').focus()
  }
  $('gate-skip').addEventListener('click', skip)
  $('gate-retry').addEventListener('click', () => void checkAccount())

  $('btn-account').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('btn-account')
    if (authState().status !== 'signed-in') {
      skipped = false
