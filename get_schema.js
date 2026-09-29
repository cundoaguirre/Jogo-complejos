const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get());
