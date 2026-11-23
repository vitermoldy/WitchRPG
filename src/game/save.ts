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
    const data = JSON.parse(raw) as Partial<Profile>
    if (data.version !== 1 || typeof data.level !== 'number' || !data.stats) throw new Error('shape')
    const base = newProfile()
    const profile: Profile = {
      ...base,
      ...data,
      stats: { ...base.stats, ...data.stats },
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
