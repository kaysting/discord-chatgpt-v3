const sqlite3 = require('better-sqlite3');

const db = sqlite3('data.db');

db.prepare(`CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time_created INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    guild_id INTEGER,
    output_entries TEXT NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS interaction_messages (
    id TEXT NOT NULL PRIMARY KEY,
    interaction_id INTEGER NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS channel_starts (
    channel_id TEXT NOT NULL PRIMARY KEY,
    start_time INTEGER NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS attachment_files (
    url TEXT NOT NULL PRIMARY KEY,
    hash TEXT NOT NULL,
    path TEXT NOT NULL,
    time_created INTEGER NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS audio_transcriptions (
    file_hash TEXT NOT NULL,
    transcription TEXT NOT NULL
)`).run();

db.pragma('journal_mode = WAL');

module.exports = db;