import Database from 'better-sqlite3';
const db = new Database('jogo_venue.db');
const matches = db.prepare('SELECT amount_paid, payment_status, start_time FROM matches;').all();
console.log('Matches:', matches);

const matchRevenueQuery = "SELECT sum(amount_paid) as total FROM matches WHERE (payment_status = 'paid' OR payment_status = 'partial') AND start_time LIKE date('now') || '%'";
console.log('Match Revenue:', db.prepare(matchRevenueQuery).get());
