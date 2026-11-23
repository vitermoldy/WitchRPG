import { randomInt } from 'node:crypto'
import express from 'express'
import { createAuth } from './auth.js'

/**
 * The API:
 *   GET  /api/health
 *   /api/auth/...                     register, login, logout, me (see auth.js)
 *   GET  /api/profile                 the account's witch, or { profile: null } before the first save
 *   PUT  /api/profile  { profile }    save the witch; an older copy than the stored one is refused
 *   POST /api/runs     { run }        one Rift that ended
 *   GET  /api/runs                    the latest 20 Rifts, newest first
 * Everything but health and auth needs a signed-in account. Each account files its data under one
 * 12-character code (`clients.id`, `users.device_id`); the browser never chooses it.
 */

const CODE = /^[A-HJ-NP-Z2-9]{12}$/
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

// Mirrors src/game: skill ids, creature kinds, shadow ranks and the five stats.
const SKILLS = new Set(['hexBolt', 'grip', 'burst', 'snare', 'barrier', 'warp', 'rite', 'swap', 'focus', 'general', 'marshal'])
const KINDS = new Set(['husk', 'hound'])
const RANKS = new Set(['prajurit', 'ksatria', 'jenderal', 'marsekal'])
const STATS = ['hex', 'spr', 'vit', 'agi', 'umb']
const RESULTS = new Set(['cleared', 'fallen', 'left'])
const MAX_LEVEL = 30
const MAX_SHADOWS = 40

/** Writes come as JSON from this site only: no form posts, no other origin. */
function sameOriginWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  if (!req.is('application/json')) return res.status(415).json({ error: 'Kirim data sebagai JSON.' })
  const origin = req.headers.origin
  if (origin && req.headers.host && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Asal permintaan tidak dikenal.' })
  next()
}

/** At most `limit` writes per minute per address. */
function rateLimit(limit) {
