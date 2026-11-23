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
    kind ENUM('husk','hound') NOT NULL,
    \`rank\` ENUM('prajurit','ksatria','jenderal','marsekal') NOT NULL,
    level TINYINT UNSIGNED NOT NULL,
    xp INT UNSIGNED NOT NULL,
    slot TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (client_id, shadow_id),
    CONSTRAINT shadows_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
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
