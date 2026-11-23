import { randomInt } from 'node:crypto'
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, USERNAME } from './auth.js'
import { config } from './config.js'
import { connect } from './db.js'

/**
 * `npm run set-user -- <username> <kata sandi>`: makes an account, or gives an existing one a
 * new password (there is no reset by email, so this is the reset). A new account takes over the
 * witch saved before accounts existed: the newest unowned browser's witch, plus the Rift history
 * of every other browser nobody owns yet.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const [username = '', password = ''] = process.argv.slice(2)
if (!USERNAME.test(username) || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
  console.error(`Pakai: npm run set-user -- <username> <kata sandi>\nUsername 3 sampai 24 karakter (huruf, angka, titik, garis bawah, minus), kata sandi ${PASSWORD_MIN} sampai ${PASSWORD_MAX} karakter.`)
  process.exit(1)
}

const pool = await connect(config.db)
const hash = await hashPassword(password)
const [[found]] = await pool.query('SELECT id, username FROM users WHERE username = ?', [username])
if (found) {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, found.id])
  // A new password signs the account out everywhere.
  await pool.query('DELETE FROM sessions WHERE user_id = ?', [found.id])
  console.log(`${config.name}: kata sandi ${found.username} diganti. Semua sesinya dikeluarkan.`)
  await pool.end()
  process.exit(0)
}

const conn = await pool.getConnection()
try {
  await conn.beginTransaction()
  const [free] = await conn.query('SELECT c.id FROM clients c LEFT JOIN users u ON u.device_id = c.id WHERE u.id IS NULL ORDER BY c.last_seen DESC')
  const client = free[0]?.id ?? Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  // Only one witch per account: the newest browser's stays, the others' Rift history joins it.
  for (const { id: other } of free.slice(1)) await conn.query('UPDATE rift_runs SET client_id = ? WHERE client_id = ?', [client, other])
  await conn.query('INSERT INTO users (username, password_hash, device_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [username, hash, client])
  await conn.commit()
  const [[w]] = await pool.query('SELECT level FROM witches WHERE client_id = ?', [client])
  const [[runs]] = await pool.query('SELECT COUNT(*) AS n FROM rift_runs WHERE client_id = ?', [client])
  console.log(
    w || runs.n
      ? `${config.name}: akun ${username} dibuat dan memegang data yang sudah ada: witch Lv ${w?.level ?? 1}, ${runs.n} Rift tercatat.`
      : `${config.name}: akun ${username} dibuat. Belum ada data sebelumnya.`,
  )
