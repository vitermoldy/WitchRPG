// Talks to the MySQL server (npm run server). People sign in with a username and password; the
// server files each account's witch and Rift history under one code. The browser keeps a code of
// its own (localStorage), offered on sign-up so the witch it already has becomes the account's.
// Finished Rifts wait in a local queue while nobody is signed in or the server is off.

import type { Profile } from '../game/progression'

const CODE_KEY = 'crimson-sovereign:client'
const QUEUE_KEY = 'crimson-sovereign:unsent-rifts'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface RiftRecord {
  tier: number
  result: 'cleared' | 'fallen' | 'left'
  wave: number
  waves: number
  kills: number
  xpGained: number
  levelsGained: number
  levelAfter: number
  shadowsRaised: number
  seconds: number
  finishedAt: string
}

export interface SavedRift extends RiftRecord {
  id: number
}

let memoryCode: string | undefined

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

function clientCode(): string {
  try {
    let code = localStorage.getItem(CODE_KEY)
    if (!code || !/^[A-HJ-NP-Z2-9]{12}$/.test(code)) {
      code = makeCode()
      localStorage.setItem(CODE_KEY, code)
    }
    return code
  } catch {
    memoryCode ??= makeCode()
    return memoryCode
  }
}

/** A failed call; `status` 0 means nothing answered. */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------- who is signed in

export interface Account {
  username: string
  createdAt: string
}
/** checking: asking the server. unavailable: the server or MySQL cannot be reached. */
export type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'unavailable'
export interface AuthState {
  status: AuthStatus
  account: Account | null
}

let auth: AuthState = { status: 'checking', account: null }
const listeners = new Set<(state: AuthState) => void>()
function setAuth(next: AuthState): void {
  auth = next
  listeners.forEach((fn) => fn(auth))
}
export const authState = (): AuthState => auth
export function onAuth(fn: (state: AuthState) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`api/${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new ApiError('Server tidak menjawab.', 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    // The session ran out or was signed out elsewhere: ask for the password again.
    if (res.status === 401 && !path.startsWith('auth/') && auth.status === 'signed-in') setAuth({ status: 'signed-out', account: null })
    throw new ApiError((body as { error?: string }).error ?? `Server menjawab ${res.status}.`, res.status)
  }
  return body as T
}

type Entry = { user: Account; device: string }

/** Asks the server who is signed in on this browser. */
export async function checkAccount(): Promise<void> {
  setAuth({ ...auth, status: 'checking' })
  try {
    const body = await call<Entry>('auth/me')
    setAuth({ status: 'signed-in', account: body.user })
  } catch (err) {
    // 401: the server works and nobody is signed in. Anything else: the server or MySQL is down.
    setAuth({ status: err instanceof ApiError && err.status === 401 ? 'signed-out' : 'unavailable', account: null })
  }
}

async function enter(path: string, payload: unknown): Promise<void> {
  try {
    const body = await call<Entry>(path, { method: 'POST', body: JSON.stringify(payload) })
    setAuth({ status: 'signed-in', account: body.user })
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err
    setAuth({ status: 'unavailable', account: null })
    throw new ApiError('Server tidak terhubung. Jalankan npm run server, lalu coba lagi.', 0)
  }
}

export const signIn = (username: string, password: string): Promise<void> => enter('auth/login', { username, password })

/** A new account. The witch and Rifts this browser has become the account's. */
export const signUp = (username: string, password: string): Promise<void> => enter('auth/register', { username, password, device: clientCode() })

/** Ends the session and forgets this browser's code and waiting Rifts; the caller clears the witch and reloads. */
export async function signOut(): Promise<void> {
  await call('auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined)
  try {
    localStorage.removeItem(CODE_KEY)
    localStorage.removeItem(QUEUE_KEY)
  } catch {
    /* blocked storage: nothing was kept either */
  }
}

// ---------------------------------------------------------------- the witch

export async function fetchProfile(): Promise<Profile | null> {
  return (await call<{ profile: Profile | null }>('profile')).profile
}

/** Saves the witch. `stale` means the server holds a newer one, which comes back as `profile`. */
export async function pushProfile(profile: Profile): Promise<{ stale: boolean; profile?: Profile }> {
  const body = await call<{ ok?: boolean; stale?: boolean; profile?: Profile }>('profile', { method: 'PUT', body: JSON.stringify({ profile }) })
  return { stale: !!body.stale, profile: body.profile }
}

// ---------------------------------------------------------------- Rift history

function readQueue(): RiftRecord[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const list = raw ? (JSON.parse(raw) as RiftRecord[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeQueue(list: RiftRecord[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-50)))
  } catch {
    /* the record is lost if storage is blocked; the history is a convenience */
  }
}

export function queuedRifts(): number {
  return readQueue().length
}

/** Sends a finished Rift now, or keeps it for later when nobody is signed in or the server does not answer. */
export async function saveRift(run: RiftRecord): Promise<boolean> {
  if (auth.status !== 'signed-in') {
    writeQueue([...readQueue(), run])
    return false
  }
  try {
    await call('runs', { method: 'POST', body: JSON.stringify({ run }) })
    return true
  } catch {
    writeQueue([...readQueue(), run])
    return false
  }
}

