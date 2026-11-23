import { config } from './config.js'
import { connect } from './db.js'

/** `npm run users`: who has an account, when they joined, and how far their witch has come. */
const when = (d) => (d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-')

const pool = await connect(config.db)
const [rows] = await pool.query(
  `SELECT u.username, u.created_at, u.last_login_at, u.last_seen_at, u.login_count, w.level, w.clears,
     (SELECT COUNT(*) FROM shadows s WHERE s.client_id = u.device_id) AS shadows,
     (SELECT COUNT(*) FROM rift_runs r WHERE r.client_id = u.device_id) AS rifts
   FROM users u LEFT JOIN witches w ON w.client_id = u.device_id ORDER BY u.created_at`,
)
