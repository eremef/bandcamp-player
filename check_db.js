
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'C:\\Users\\eremef\\AppData\\Roaming\\bandcamp-player\\bandcamp-player.db';

try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings');
    if (row) {
        console.log('Settings found:', row.value);
    } else {
        console.log('Settings not found');
    }
} catch (error) {
    console.error('Error reading database:', error);
}
