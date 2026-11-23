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
