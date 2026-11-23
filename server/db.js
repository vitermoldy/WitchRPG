import mysql from 'mysql2/promise'
import { AUTH_TABLES } from './auth.js'

/**
 * The witch and her Rifts, plus users and sessions from auth.js:
 * - clients: one row per data key; each account owns one (users.device_id);
 * - witches: the progress of that key: level, XP, points, the five stats, settings;
 * - witch_upgrades: the skill upgrades bought in the Ledger, one row each;
 * - shadows: the Shadow Room, one row per raised shadow;
 * - rift_runs: every Rift that ended (cleared, fallen or left) with what happened in it.
 * Times are stored in UTC.
 */
const TABLES = [
  `CREATE TABLE IF NOT EXISTS clients (
    id CHAR(12) PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS witches (
    client_id CHAR(12) PRIMARY KEY,
    level TINYINT UNSIGNED NOT NULL,
    xp INT UNSIGNED NOT NULL,
    stat_points SMALLINT UNSIGNED NOT NULL,
    skill_points SMALLINT UNSIGNED NOT NULL,
    hex SMALLINT UNSIGNED NOT NULL,
    spr SMALLINT UNSIGNED NOT NULL,
    vit SMALLINT UNSIGNED NOT NULL,
    agi SMALLINT UNSIGNED NOT NULL,
    umb SMALLINT UNSIGNED NOT NULL,
    next_shadow_id INT UNSIGNED NOT NULL,
    clears INT UNSIGNED NOT NULL,
    boss_kills INT UNSIGNED NOT NULL DEFAULT 0,
    settings JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT witches_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS witch_upgrades (
    client_id CHAR(12) NOT NULL,
    skill VARCHAR(16) NOT NULL,
    PRIMARY KEY (client_id, skill),
    CONSTRAINT upgrades_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS shadows (
    client_id CHAR(12) NOT NULL,
    shadow_id INT UNSIGNED NOT NULL,
    name VARCHAR(24) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    \`rank\` ENUM('prajurit','ksatria','jenderal','marsekal') NOT NULL,
    level TINYINT UNSIGNED NOT NULL,
    xp INT UNSIGNED NOT NULL,
    slot SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (client_id, shadow_id),
    CONSTRAINT shadows_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS tier_clears (
    client_id CHAR(12) NOT NULL,
    tier TINYINT UNSIGNED NOT NULL,
    clears INT UNSIGNED NOT NULL,
    PRIMARY KEY (client_id, tier),
    CONSTRAINT tier_clears_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS rift_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    client_id CHAR(12) NOT NULL,
    tier TINYINT UNSIGNED NOT NULL,
    result ENUM('cleared','fallen','left') NOT NULL,
    wave TINYINT UNSIGNED NOT NULL,
    waves TINYINT UNSIGNED NOT NULL,
    kills SMALLINT UNSIGNED NOT NULL,
    xp_gained INT UNSIGNED NOT NULL,
    levels_gained TINYINT UNSIGNED NOT NULL,
    level_after TINYINT UNSIGNED NOT NULL,
    shadows_raised SMALLINT UNSIGNED NOT NULL,
    seconds INT UNSIGNED NOT NULL,
    boss TINYINT UNSIGNED NOT NULL DEFAULT 0,
    finished_at DATETIME NOT NULL,
    INDEX runs_by_client (client_id, finished_at),
    CONSTRAINT runs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

/** Creates the database and the tables if they are missing, then hands back a pool. */
export async function connect(db) {
  const boot = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password })
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${db.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await boot.end()
  const pool = mysql.createPool({ ...db, connectionLimit: 8, timezone: 'Z' })
  // Auth first: nothing else refers to users, and clients must exist before the game tables.
  for (const sql of [...AUTH_TABLES, ...TABLES]) await pool.query(sql)
  await migrate(pool)
  return pool
}

/** Brings a database made before version 1 (Tier I only) up to date. Safe to run every start. */
async function migrate(pool) {
  const has = async (table, column) => {
    const [rows] = await pool.query('SELECT DATA_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column])
    return rows[0]?.t ?? null
  }
  // Shadows can now be Spitters, Wardens, a Rift Lord or the boss.
  if ((await has('shadows', 'kind')) === 'enum') await pool.query('ALTER TABLE shadows MODIFY kind VARCHAR(16) NOT NULL')
  if (!(await has('witches', 'boss_kills'))) await pool.query('ALTER TABLE witches ADD COLUMN boss_kills INT UNSIGNED NOT NULL DEFAULT 0 AFTER clears')
  if (!(await has('rift_runs', 'boss'))) await pool.query('ALTER TABLE rift_runs ADD COLUMN boss TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER seconds')
  // The Shadow Room has no slot limit any more, and one cast can raise a whole pile of bodies.
  if ((await has('shadows', 'slot')) === 'tinyint') await pool.query('ALTER TABLE shadows MODIFY slot SMALLINT UNSIGNED NOT NULL')
}
