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
