const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
try {
  const info = db.pragma('table_info(match_players)');
  console.log(info);
} catch(e) {
  console.error(e);
}
