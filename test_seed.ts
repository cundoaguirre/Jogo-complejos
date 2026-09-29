import Database from 'better-sqlite3';
const db = new Database('jogo_venue.db');

try {
  const insertMatch = db.prepare(`
    INSERT INTO matches (court_id, host_id, start_time, end_time, max_players, price_total, payment_status, amount_paid, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const today = new Date().toISOString().split('T')[0];
  insertMatch.run(1, 1, `${today}T18:00:00`, `${today}T19:00:00`, 10, 45000, 'paid', 45000, 'complete');
  console.log("Success");
} catch (e) {
  console.log(e);
}
