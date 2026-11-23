import { DEFAULT_SETTINGS, newProfile, STAT_KEYS, type Profile } from './progression'

const KEY = 'crimson-sovereign:profile:v1'

/** Reads the saved witch. Storage can be blocked or hold junk; both give a fresh profile. */
export function loadProfile(): { profile: Profile; error: string | null } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return { profile: newProfile(), error: 'Penyimpanan browser diblokir, progres tidak akan tersimpan.' }
  }
  if (!raw) return { profile: newProfile(), error: null }
  try {
    const profile = normalizeProfile(JSON.parse(raw))
    return { profile, error: null }
  } catch {
    return { profile: newProfile(), error: 'Data simpanan rusak, jadi witch dimulai dari Lv 1.' }
  }
}

export function saveProfile(p: Profile): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    return true
  } catch {
    return false
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: nothing to clear */
  }
}
