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

