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
