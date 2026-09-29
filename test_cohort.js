const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const users = db.prepare('SELECT id, created_at FROM users WHERE created_at IS NOT NULL').all();
const matches = db.prepare(`
  SELECT mp.user_id, m.start_time 
  FROM match_players mp
  JOIN matches m ON mp.match_id = m.id
  WHERE m.start_time IS NOT NULL
`).all();

console.log(users.length, "users");
console.log(matches.length, "matches");
