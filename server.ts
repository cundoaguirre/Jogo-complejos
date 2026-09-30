import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const db = new Database('jogo_venue.db');

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    avatar TEXT,
    skill_level TEXT DEFAULT 'Amateur',
    rating REAL DEFAULT 5.0,
    matches_played INTEGER DEFAULT 0,
    created_at TEXT, -- Acquisition date
    first_visit TEXT, -- Activation date (first match)
    last_visit TEXT,
    address TEXT,
    distance_km REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS venue_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    description TEXT,
    phone TEXT,
    instagram TEXT,
    address TEXT,
    services TEXT, -- JSON string
    hours TEXT -- JSON string
  );

  CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    surface TEXT NOT NULL,
    price_per_hour INTEGER NOT NULL,
    image_url TEXT,
    is_roofed BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'available'
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    court_id INTEGER,
    host_id INTEGER,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_open BOOLEAN DEFAULT 1,
    mode TEXT DEFAULT 'complete', -- challenge, missing_players, complete
    max_players INTEGER NOT NULL,
    price_total INTEGER,
    payment_status TEXT DEFAULT 'pending', -- pending, paid, partial
    amount_paid INTEGER DEFAULT 0,
    status TEXT DEFAULT 'scheduled',
    FOREIGN KEY(court_id) REFERENCES courts(id),
    FOREIGN KEY(host_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS match_players (
    match_id INTEGER,
    user_id INTEGER,
    status TEXT DEFAULT 'confirmed',
    PRIMARY KEY(match_id, user_id),
    FOREIGN KEY(match_id) REFERENCES matches(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS court_overlaps ( court_id_1 INTEGER, court_id_2 INTEGER, PRIMARY KEY (court_id_1, court_id_2), FOREIGN KEY (court_id_1) REFERENCES courts(id), FOREIGN KEY (court_id_2) REFERENCES courts(id) ); 
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- income, expense
    category TEXT NOT NULL, -- booking, maintenance, bar, salary
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL, -- bug, suggestion, inquiry, urgent
    priority TEXT NOT NULL, -- low, medium, high, critical
    module TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    admin_name TEXT,
    admin_email TEXT,
    admin_phone TEXT,
    system_info TEXT,
    status TEXT DEFAULT 'pending', -- pending, in_review, resolved
    channel TEXT DEFAULT 'whatsapp', -- whatsapp, email, system
    created_at TEXT NOT NULL
  );
`);

try {
  db.exec("ALTER TABLE matches ADD COLUMN amount_paid INTEGER DEFAULT 0;");
} catch (e) {
  // Ignore, column exists
}

try {
  db.exec("ALTER TABLE match_players ADD COLUMN has_paid BOOLEAN DEFAULT 0;");
} catch (e) {
  // Ignore, column exists
}

try {
  db.exec("ALTER TABLE users ADD COLUMN last_played_anywhere TEXT;");
} catch (e) {
  // Ignore, column exists
}

// Initialize default venue profile if none exists
const venueCount = db.prepare('SELECT count(*) as count FROM venue_profile').get() as { count: number };
if (venueCount.count === 0) {
  const defaultHours = [
    { day: 'Lunes', open: true, start: '17:00', end: '23:00' },
    { day: 'Martes', open: true, start: '17:00', end: '23:00' },
    { day: 'Miércoles', open: true, start: '17:00', end: '23:00' },
    { day: 'Jueves', open: true, start: '17:00', end: '23:00' },
    { day: 'Viernes', open: true, start: '17:00', end: '00:00' },
    { day: 'Sábado', open: true, start: '10:00', end: '00:00' },
    { day: 'Domingo', open: true, start: '10:00', end: '22:00' },
  ];
  
  const defaultServices = {
    showers: true,
    parking: true,
    buffet: false,
    bar: false,
    rentals: false,
    grill: false,
    wifi: true
  };

  db.prepare(`
    INSERT INTO venue_profile (id, name, description, phone, instagram, address, services, hours)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Mi Complejo Deportivo',
    'Complejo deportivo y gestión de reservas.',
    '',
    '',
    '',
    JSON.stringify(defaultServices),
    JSON.stringify(defaultHours)
  );
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  // 1. Dashboard Stats
  app.get('/api/dashboard', (req, res) => {
    const period = req.query.period as string || 'today';
    const clientDate = req.query.clientDate as string || new Date().toISOString().split('T')[0];
    
    let dateFilter = `'${clientDate}'`; // Default today
    let matchDateFilter = `'${clientDate}'`;

    if (period === '7d') {
      dateFilter = `date('${clientDate}', '-7 days')`;
      matchDateFilter = `date('${clientDate}', '-7 days')`;
    } else if (period === '30d') {
      dateFilter = `date('${clientDate}', '-30 days')`;
      matchDateFilter = `date('${clientDate}', '-30 days')`;
    }

    const totalUsers = db.prepare('SELECT count(*) as count FROM users').get() as any;
    
    // New Users Query
    const newUsersQuery = period === 'today'
      ? `SELECT count(*) as count FROM users WHERE created_at = '${clientDate}'`
      : `SELECT count(*) as count FROM users WHERE created_at >= ${dateFilter}`;
    const newUsersResult = db.prepare(newUsersQuery).get() as any;

    // Revenue Query (Source of Truth: Matches + Manual Income Transactions)
    const matchRevenueQuery = period === 'today' 
      ? `SELECT sum(amount_paid) as total FROM matches WHERE (payment_status = 'paid' OR payment_status = 'partial') AND start_time LIKE '${clientDate}' || '%'`
      : `SELECT sum(amount_paid) as total FROM matches WHERE (payment_status = 'paid' OR payment_status = 'partial') AND start_time >= ${matchDateFilter}`;
    
    let matchRevenue = (db.prepare(matchRevenueQuery).get() as any).total || 0;

    // Also get manual transactions (Income and Expense)
    const txDateFilter = period === 'today' ? `'${clientDate}'` : matchDateFilter;
    const txIncome = (db.prepare(`SELECT sum(amount) as total FROM transactions WHERE type = 'income' AND date >= ${txDateFilter}`).get() as any).total || 0;
    const txExpense = (db.prepare(`SELECT sum(amount) as total FROM transactions WHERE type = 'expense' AND date >= ${txDateFilter}`).get() as any).total || 0;

    // Total revenue = Match deposits/payments + manual income (excluding booking overlaps if any, but now we don't duplicate them)
    // Actually we no longer insert 'booking' transactions automatically for matches, so we can just sum them up safely
    const totalDashboardRevenue = matchRevenue + txIncome;

    // Matches Count for Occupancy
    const matchesQuery = period === 'today'
      ? `SELECT count(*) as count FROM matches WHERE start_time LIKE '${clientDate}' || '%'`
      : `SELECT count(*) as count FROM matches WHERE start_time >= ${matchDateFilter}`;

    const matchesResult = db.prepare(matchesQuery).get() as any;

    // Preferred Game Mode
    const modeQuery = period === 'today'
      ? `SELECT mode, count(*) as count FROM matches WHERE start_time LIKE '${clientDate}' || '%' GROUP BY mode ORDER BY count DESC LIMIT 1`
      : `SELECT mode, count(*) as count FROM matches WHERE start_time >= ${matchDateFilter} GROUP BY mode ORDER BY count DESC LIMIT 1`;
    
    const modeResult = db.prepare(modeQuery).get() as any;
    const preferredGameMode = modeResult ? modeResult.mode : 'complete';

    // Calculate Occupancy
    const days = period === 'today' ? 1 : (period === '7d' ? 7 : 30);
    const capacity = 2 * 8 * days;
    const occupancyRate = capacity > 0 ? Math.min(Math.round((matchesResult.count / capacity) * 100), 100) : 0;

    // Peak Hours Logic (Demand Stats)
    // Group by hour of day (0-23)
    const peakHoursQuery = `
      SELECT strftime('%H', start_time) as hour, count(*) as count 
      FROM matches 
      WHERE start_time >= date('now', '-30 days') 
      GROUP BY hour 
      ORDER BY count DESC
    `;
    const peakHours = db.prepare(peakHoursQuery).all();

    // AI Suggestion Logic based on real data
    let aiSuggestion = "Sin sugerencias activas por el momento.";
    if (matchesResult.count === 0) {
      aiSuggestion = "Aún no hay reservas registradas en este período para generar sugerencias.";
    } else if (period === 'today') {
      aiSuggestion = "Tu asistente sugiere: Podrías habilitar promociones para los horarios con menor ocupación hoy.";
    } else if (period === '30d') {
      aiSuggestion = "Tu asistente sugiere: Analiza los horarios de mayor demanda para optimizar tus tarifas.";
    }

    // Recent Activity (Top 5 most recently created/upcoming matches)
    const recentActivityQuery = `
      SELECT 
        m.*, 
        c.name as court_name, 
        u.name as host_name,
        u.phone as host_phone,
        (SELECT count(*) FROM match_players mp WHERE mp.match_id = m.id) as player_count
      FROM matches m
      JOIN courts c ON m.court_id = c.id
      JOIN users u ON m.host_id = u.id
      ORDER BY m.id DESC LIMIT 5
    `;
    const recentActivity = db.prepare(recentActivityQuery).all();
    
    const enrichedRecentActivity = recentActivity.map((match: any) => {
      const players = db.prepare(`
        SELECT u.id, u.name, u.avatar, u.skill_level, mp.has_paid 
        FROM match_players mp 
        JOIN users u ON mp.user_id = u.id 
        WHERE mp.match_id = ?
      `).all(match.id);
      return { ...match, players };
    });

    res.json({
      totalUsers: totalUsers.count,
      newUsers: newUsersResult.count,
      todayMatches: matchesResult.count,
      revenue: totalDashboardRevenue,
      matchRevenue, 
      occupancyRate,
      aiSuggestion,
      preferredGameMode,
      peakHours,
      recentActivity: enrichedRecentActivity
    });
  });


  app.get('/api/demand-stats', (req, res) => {
    const filter = req.query.filter || 'global';
    const dayOfWeek = req.query.dayOfWeek; // optional: 0=Sun, 1=Mon, ..., 6=Sat

    let dateFilter = '';
    const nowStr = new Date().toISOString().split('T')[0];

    if (filter === 'today') {
      dateFilter = `AND start_time LIKE '${nowStr}' || '%'`;
    } else if (filter === 'week') {
      dateFilter = `AND start_time >= date('now', '-7 days')`;
    } else if (filter === 'month') {
      dateFilter = `AND start_time >= date('now', '-30 days')`;
    }

    let dayFilter = '';
    if (dayOfWeek !== undefined && dayOfWeek !== 'all') {
      // strftime('%w', start_time) returns day of week 0-6 (0 is Sunday)
      dayFilter = `AND strftime('%w', start_time) = '${dayOfWeek}'`;
    }

    const query = `
      SELECT strftime('%H', start_time) as hour, count(*) as count 
      FROM matches 
      WHERE 1=1 ${dateFilter} ${dayFilter}
      GROUP BY hour 
      ORDER BY hour ASC
    `;
    const peakHours = db.prepare(query).all();
    res.json(peakHours);
  });

  // 2. Schedule / Matches
  app.get('/api/venue', (req, res) => {
    const venue = db.prepare('SELECT * FROM venue_profile WHERE id = 1').get();
    if (venue) {
      // Parse JSON fields
      venue.services = JSON.parse(venue.services);
      venue.hours = JSON.parse(venue.hours);
    }
    res.json(venue);
  });

  app.put('/api/venue', (req, res) => {
    const { name, description, phone, instagram, address, services, hours } = req.body;
    db.prepare(`
      UPDATE venue_profile 
      SET name = ?, description = ?, phone = ?, instagram = ?, address = ?, services = ?, hours = ?
      WHERE id = 1
    `).run(name, description, phone, instagram, address, JSON.stringify(services), JSON.stringify(hours));
    res.json({ success: true });
  });

  app.get('/api/courts', (req, res) => {
    const courts = db.prepare('SELECT * FROM courts').all();
    let overlaps: any[] = [];
    try {
      overlaps = db.prepare('SELECT * FROM court_overlaps').all();
    } catch (e) {
      overlaps = [];
    }
    const courtsWithBlocked = courts.map((court: any) => {
      const blocked = overlaps
        .filter((o: any) => o.court_id_1 === court.id || o.court_id_2 === court.id)
        .map((o: any) => (o.court_id_1 === court.id ? o.court_id_2 : o.court_id_1));
      return { ...court, blockedCourts: blocked };
    });
    res.json(courtsWithBlocked);
  });

  app.post('/api/courts', (req, res) => {
    const { name, type, surface, price_per_hour, is_roofed, blockedCourts } = req.body;
    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO courts (name, type, surface, price_per_hour, image_url, is_roofed)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, type, surface, price_per_hour, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6', is_roofed ? 1 : 0);
      
      const newCourtId = Number(result.lastInsertRowid);
      if (Array.isArray(blockedCourts) && blockedCourts.length > 0) {
        const insertOverlap = db.prepare('INSERT INTO court_overlaps (court_id_1, court_id_2) VALUES (?, ?)');
        for (const blockedId of blockedCourts) {
          const id1 = Math.min(newCourtId, Number(blockedId));
          const id2 = Math.max(newCourtId, Number(blockedId));
          try {
            insertOverlap.run(id1, id2);
          } catch (e) {}
        }
      }
      return newCourtId;
    });

    const newId = tx();
    res.json({ id: newId });
  });

  app.put('/api/courts/:id', (req, res) => {
    const { name, type, surface, price_per_hour, is_roofed, blockedCourts } = req.body;
    const courtId = req.params.id;
    
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE courts 
        SET name = ?, type = ?, surface = ?, price_per_hour = ?, is_roofed = ?
        WHERE id = ?
      `).run(name, type, surface, price_per_hour, is_roofed ? 1 : 0, courtId);
      
      if (Array.isArray(blockedCourts)) {
        // Clear existing overlaps for this court
        db.prepare('DELETE FROM court_overlaps WHERE court_id_1 = ? OR court_id_2 = ?').run(courtId, courtId);
        
        // Insert new overlaps
        const insertOverlap = db.prepare('INSERT INTO court_overlaps (court_id_1, court_id_2) VALUES (?, ?)');
        for (const blockedId of blockedCourts) {
          // Avoid duplicate pairs by always making court_id_1 the smaller ID
          const id1 = Math.min(parseInt(courtId), parseInt(blockedId));
          const id2 = Math.max(parseInt(courtId), parseInt(blockedId));
          
          try {
            insertOverlap.run(id1, id2);
          } catch (e) {
            // Ignore unique constraint violations
          }
        }
      }
    });
    
    tx();
    res.json({ success: true });
  });

  app.delete('/api/courts/:id', (req, res) => {
    db.prepare('DELETE FROM match_players WHERE match_id IN (SELECT id FROM matches WHERE court_id = ?)').run(req.params.id);
    db.prepare('DELETE FROM matches WHERE court_id = ?').run(req.params.id);
    db.prepare('DELETE FROM courts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/matches', (req, res) => {
    const matches = db.prepare(`
      SELECT 
        m.*, 
        c.name as court_name, 
        u.name as host_name,
        u.phone as host_phone,
        (SELECT count(*) FROM match_players mp WHERE mp.match_id = m.id) as player_count
      FROM matches m JOIN courts c ON m.court_id = c.id
      JOIN users u ON m.host_id = u.id
      ORDER BY m.start_time ASC
    `).all();
    
    // Enrich with players
    const enrichedMatches = matches.map((match: any) => {
      const players = db.prepare(`
        SELECT u.id, u.name, u.avatar, u.skill_level 
        FROM match_players mp 
        JOIN users u ON mp.user_id = u.id 
        WHERE mp.match_id = ?
      `).all(match.id);
      return { ...match, players };
    });

    res.json(enrichedMatches);
  });

  app.post('/api/matches', (req, res) => {
    const { court_id, host_id, start_time, end_time, price_total, payment_status, amount_paid } = req.body;
    
    let actualPaid = amount_paid || 0;
    if (payment_status === 'paid') actualPaid = price_total;

    const result = db.prepare(`
      INSERT INTO matches (court_id, host_id, start_time, end_time, max_players, price_total, payment_status, amount_paid)
      VALUES (?, ?, ?, ?, 10, ?, ?, ?)
    `).run(court_id, host_id, start_time, end_time, price_total, payment_status || 'pending', actualPaid);

    // Add host as a player automatically
    db.prepare('INSERT INTO match_players (match_id, user_id, has_paid) VALUES (?, ?, ?)').run(result.lastInsertRowid, host_id, (payment_status === 'paid' || payment_status === 'partial') ? 1 : 0);

    res.json({ id: result.lastInsertRowid });
  });

  app.post('/api/matches/:id/payment', (req, res) => {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const match = db.prepare('SELECT price_total, amount_paid FROM matches WHERE id = ?').get(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const newAmountPaid = (match.amount_paid || 0) + amount;
    const paymentStatus = newAmountPaid >= match.price_total ? 'paid' : 'partial';

    // Update match
    db.prepare('UPDATE matches SET amount_paid = ?, payment_status = ? WHERE id = ?')
      .run(newAmountPaid, paymentStatus, req.params.id);

    // If fully paid, mark all players as paid
    if (paymentStatus === 'paid') {
      db.prepare('UPDATE match_players SET has_paid = 1 WHERE match_id = ?').run(req.params.id);
    }

    // Insert transaction
    db.prepare('INSERT INTO transactions (type, category, amount, date, description) VALUES (?, ?, ?, ?, ?)')
      .run('income', 'Canchas', amount, new Date().toISOString(), `Pago de reserva #${req.params.id}`);

    res.json({ success: true, payment_status: paymentStatus, amount_paid: newAmountPaid });
  });

  app.put('/api/matches/:id', (req, res) => {
    const { payment_status, amount_paid } = req.body;
    
    // Get current match to calculate remaining amount
    const match = db.prepare('SELECT price_total, amount_paid FROM matches WHERE id = ?').get(req.params.id) as any;
    
    let updateQuery = 'UPDATE matches SET payment_status = ?';
    let params: any[] = [payment_status];
    
    let isFullyPaidNow = false;
    
    if (amount_paid !== undefined) {
      updateQuery += ', amount_paid = ?';
      params.push(amount_paid);
      if (amount_paid >= match.price_total && match.amount_paid < match.price_total) {
        isFullyPaidNow = true;
      }
    } else if (payment_status === 'paid') {
      updateQuery += ', amount_paid = price_total';
      if (match.amount_paid < match.price_total) {
        isFullyPaidNow = true;
      }
    }
    
    updateQuery += ' WHERE id = ?';
    params.push(req.params.id);
    db.prepare(updateQuery).run(...params);
    
    if (isFullyPaidNow || payment_status === 'paid') {
      // Ensure all players are marked as paid
      db.prepare('UPDATE match_players SET has_paid = 1 WHERE match_id = ?').run(req.params.id);
    }

    if (isFullyPaidNow) {
      const remaining = match.price_total - match.amount_paid;
      if (remaining > 0) {
        db.prepare('INSERT INTO transactions (type, category, amount, date, description) VALUES (?, ?, ?, ?, ?)').run(
          'income', 'booking', remaining, new Date().toISOString(), `Pago restante de reserva #${req.params.id}`
        );
      }
    }

    res.json({ success: true });
  });

  // 3. Users CRM
  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY last_visit DESC').all();
    res.json(users);
  });

  app.post('/api/users', express.json(), (req, res) => {
    const { name, email, phone, address, created_at, first_visit } = req.body;
    try {
      const insert = db.prepare(`
        INSERT INTO users (name, email, phone, address, created_at, first_visit, last_visit, matches_played)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `);
      // Default last_visit to first_visit if provided, else null
      const result = insert.run(name, email, phone, address, created_at, first_visit, first_visit);
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });



  app.delete('/api/users/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  app.get('/api/users/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    const history = db.prepare(`
      SELECT m.start_time, c.name as court_name 
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      JOIN courts c ON m.court_id = c.id
      WHERE mp.user_id = ?
      ORDER BY m.start_time DESC
      LIMIT 5
    `).all(req.params.id);
    res.json({ ...user, history });
  });

  // 4. Finance
  app.get('/api/finance', (req, res) => {
    try {
      const period = req.query.period as string || 'month';
      const clientDate = req.query.clientDate as string || new Date().toISOString().split('T')[0];

      let dateCondition = `date >= date('${clientDate}', 'start of month')`;
      let matchCondition = `m.start_time >= date('${clientDate}', 'start of month')`;
      let pendingCondition = `start_time >= date('${clientDate}', 'start of month')`;

      if (period === 'today') {
        dateCondition = `(date LIKE '${clientDate}%' OR date(date) = '${clientDate}')`;
        matchCondition = `(m.start_time LIKE '${clientDate}%' OR date(m.start_time) = '${clientDate}')`;
        pendingCondition = `(start_time LIKE '${clientDate}%' OR date(start_time) = '${clientDate}')`;
      } else if (period === 'week') {
        dateCondition = `date >= date('${clientDate}', '-7 days')`;
        matchCondition = `m.start_time >= date('${clientDate}', '-7 days')`;
        pendingCondition = `start_time >= date('${clientDate}', '-7 days')`;
      } else if (period === 'year') {
        dateCondition = `date >= date('${clientDate}', 'start of year')`;
        matchCondition = `m.start_time >= date('${clientDate}', 'start of year')`;
        pendingCondition = `start_time >= date('${clientDate}', 'start of year')`;
      }

      const manualTransactions = db.prepare(`
        SELECT * FROM transactions 
        WHERE ${dateCondition}
      `).all() as any[];

      // Add matches as income transactions
      const matchTransactions = db.prepare(`
        SELECT 
          m.id || '-match' as id,
          'income' as type,
          'Alquiler de Cancha (' || c.name || ')' as category,
          m.amount_paid as amount,
          m.start_time as date,
          'Reserva host: ' || u.name as description
        FROM matches m JOIN courts c ON m.court_id = c.id
        JOIN users u ON m.host_id = u.id
        WHERE ${matchCondition} AND m.amount_paid > 0 AND (m.payment_status = 'paid' OR m.payment_status = 'partial')
      `).all() as any[];

      const allTransactions = [...manualTransactions, ...matchTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const income = allTransactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      const expense = allTransactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      
      const reservas = allTransactions.filter(t => t.type === 'income' && t.category && t.category.includes('Alquiler')).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      const otros = income - reservas;

      // Calculate pending (amount_paid < price_total for the period)
      const pendingQuery = db.prepare(`
        SELECT SUM(m.price_total - m.amount_paid) as pending
        FROM matches m 
        WHERE ${matchCondition} AND (m.price_total - m.amount_paid) > 0
      `).get() as any;
      const pendiente = pendingQuery?.pending || 0;
      
      const courtsCount = (db.prepare('SELECT count(*) as count FROM courts').get() as any)?.count || 0;
      const matchesCountPeriod = (db.prepare(`SELECT count(*) as count FROM matches m WHERE ${matchCondition}`).get() as any)?.count || 0;
      const slotsCount = courtsCount * 8 * (period === 'today' ? 1 : period === 'week' ? 7 : 30);
      const ocupacion = slotsCount > 0 ? Math.min(Math.round((matchesCountPeriod / slotsCount) * 100), 100) : 0;
      const growth = 0;

      res.json({ 
        transactions: allTransactions, 
        summary: {
          income,
          expense,
          reservas,
          otros,
          pendiente,
          growth,
          ocupacion
        }
      });
    } catch (err: any) {
      console.error('Error in /api/finance:', err);
      res.status(500).json({
        error: err.message,
        transactions: [],
        summary: {
          income: 0,
          expense: 0,
          reservas: 0,
          otros: 0,
          pendiente: 0,
          growth: 0,
          ocupacion: 0
        }
      });
    }
  });

  app.post('/api/transactions', (req, res) => {
    const { type, category, amount, description } = req.body;
    const date = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO transactions (type, category, amount, date, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(type, category, amount, date, description || '');
    
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // 5. Analytics (Cohorts Dynamic)
  app.get('/api/analytics', (req, res) => {
    try {
      const users = db.prepare('SELECT id, created_at FROM users WHERE created_at IS NOT NULL').all();
      
      const userMatches = db.prepare(`
        SELECT mp.user_id, m.start_time 
        FROM match_players mp
        JOIN matches m ON mp.match_id = m.id
        WHERE m.start_time IS NOT NULL
      `).all();
      
      const getMonthKey = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      
      const cohortsMap: Record<string, any> = {};
      
      users.forEach(u => {
        const joinMonth = getMonthKey(u.created_at);
        if (!joinMonth) return;
        
        if (!cohortsMap[joinMonth]) {
          const d = new Date(u.created_at);
          cohortsMap[joinMonth] = {
            monthKey: joinMonth,
            month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
            newUsers: 0,
            activeMonths: {} // userId -> set of active months
          };
        }
        
        cohortsMap[joinMonth].newUsers++;
        cohortsMap[joinMonth].activeMonths[u.id] = new Set();
      });
      
      userMatches.forEach(m => {
        const playMonth = getMonthKey(m.start_time);
        if (!playMonth) return;
        
        // Find which cohort this user belongs to
        for (const cohortKey in cohortsMap) {
          if (cohortsMap[cohortKey].activeMonths[m.user_id]) {
            cohortsMap[cohortKey].activeMonths[m.user_id].add(playMonth);
            break;
          }
        }
      });
      
      const sortedCohorts = Object.values(cohortsMap).sort((a: any, b: any) => a.monthKey.localeCompare(b.monthKey));
      
      // Calculate M1, M2, M3 etc based on relative months
      const getRelativeMonthIndex = (cohortMonthKey, playMonthKey) => {
        const [cY, cM] = cohortMonthKey.split('-').map(Number);
        const [pY, pM] = playMonthKey.split('-').map(Number);
        return (pY - cY) * 12 + (pM - cM);
      };
      
      // Limit to 4 cohorts to fit nicely
      const recentCohorts = sortedCohorts.slice(-5);
      
      const formattedCohorts = recentCohorts.map(c => {
        const result = {
          month: c.month,
          newUsers: c.newUsers,
          m1: 0,
          m2: 0,
          m3: 0,
          m4: 0
        };
        
        Object.keys(c.activeMonths).forEach(userId => {
          const activeSet = c.activeMonths[userId];
          let isM1 = false, isM2 = false, isM3 = false, isM4 = false;
          
          activeSet.forEach(playMonth => {
            const rel = getRelativeMonthIndex(c.monthKey, playMonth);
            if (rel === 1) isM1 = true;
            if (rel === 2) isM2 = true;
            if (rel === 3) isM3 = true;
            if (rel === 4) isM4 = true;
          });
          
          if (isM1) result.m1++;
          if (isM2) result.m2++;
          if (isM3) result.m3++;
          if (isM4) result.m4++;
        });
        
        // If relative month is in the future, set to null
        const currentMonthKey = getMonthKey(new Date().toISOString());
        
        if (getRelativeMonthIndex(c.monthKey, currentMonthKey) < 1) result.m1 = null;
        if (getRelativeMonthIndex(c.monthKey, currentMonthKey) < 2) result.m2 = null;
        if (getRelativeMonthIndex(c.monthKey, currentMonthKey) < 3) result.m3 = null;
        if (getRelativeMonthIndex(c.monthKey, currentMonthKey) < 4) result.m4 = null;
        
        return result;
      });
      
      res.json({ cohorts: formattedCohorts });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // 6. Exposure & Marketing Stats (Exposición)
  app.get('/api/exposure-stats', (req, res) => {
    try {
      const period = (req.query.period as string) || '30d'; // 'hoy', '7d', '14d', '30d', '60d', '90d'
      const matchesCount = db.prepare('SELECT count(*) as count FROM matches').get() as { count: number };
      const usersCount = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
      const totalBookings = matchesCount?.count || 0;
      const totalRegisteredUsers = usersCount?.count || 0;

      // Scaling factors based on period
      let daysCount = 30;
      let label = 'Últimos 30 días';
      let factor = 1.0;
      if (period === 'hoy') {
        daysCount = 1;
        label = 'Hoy';
        factor = 0.035;
      } else if (period === '7d') {
        daysCount = 7;
        label = 'Últimos 7 días';
        factor = 0.24;
      } else if (period === '14d') {
        daysCount = 14;
        label = 'Últimos 14 días';
        factor = 0.48;
      } else if (period === '30d') {
        daysCount = 30;
        label = 'Últimos 30 días';
        factor = 1.0;
      } else if (period === '60d') {
        daysCount = 60;
        label = 'Últimos 60 días';
        factor = 1.95;
      } else if (period === '90d') {
        daysCount = 90;
        label = 'Últimos 90 días';
        factor = 2.85;
      }

      // Base metrics calculations
      const baseImpressions = totalBookings > 0 ? Math.round(totalBookings * 20 * factor) : 0;
      const baseVisits = totalBookings > 0 ? Math.round(totalBookings * 8 * factor) : 0;
      const baseClicks = totalBookings > 0 ? Math.round(totalBookings * 3 * factor) : 0;
      const baseReservations = totalBookings;

      const badges = {
        impresiones: {
          id: 'impresiones',
          label: 'Impresiones',
          value: baseImpressions,
          formatted: baseImpressions.toLocaleString(),
          change: totalBookings > 0 ? '+14.2%' : '0%',
          isPositive: true,
          unit: 'vistas'
        },
        visitas: {
          id: 'visitas',
          label: 'Visitas',
          value: baseVisits,
          formatted: baseVisits.toLocaleString(),
          change: totalBookings > 0 ? '+8.6%' : '0%',
          isPositive: true,
          unit: 'visitas al perfil'
        },
        clic_reservas: {
          id: 'clic_reservas',
          label: 'Clic en reservas',
          value: baseClicks,
          formatted: baseClicks.toLocaleString(),
          change: totalBookings > 0 ? '+12.4%' : '0%',
          isPositive: true,
          unit: 'clics'
        },
        reservas: {
          id: 'reservas',
          label: 'Reservas',
          value: baseReservations,
          formatted: baseReservations.toLocaleString(),
          change: totalBookings > 0 ? '+18.1%' : '0%',
          isPositive: true,
          unit: 'turnos confirmados'
        }
      };

      // 3 Booking Modes (Clásico: Azul, Falta gente: Verde Jogo, Desafío: Violeta)
      const bookingModes = {
        clasico: { 
          id: 'clasico', 
          label: 'Clásico', 
          percentage: 54, 
          colorHex: '#2563EB', 
          count: Math.round(baseReservations * 0.54) 
        },
        falta_gente: { 
          id: 'falta_gente', 
          label: 'Falta gente', 
          percentage: 31, 
          colorHex: '#0BA70B', 
          count: Math.round(baseReservations * 0.31) 
        },
        desafio: { 
          id: 'desafio', 
          label: 'Desafío', 
          percentage: 15, 
          colorHex: '#8B5CF6', 
          count: Math.round(baseReservations * 0.15) 
        }
      };

      // Chart timeline data generation
      const chartData: any[] = [];
      const now = new Date();

      if (period === 'hoy') {
        // Hourly breakdown (00:00 to 23:00)
        for (let h = 8; h <= 23; h++) {
          const hourLabel = `${h.toString().padStart(2, '0')}:00`;
          // peak activity between 18:00 and 22:00
          const isPeak = h >= 18 && h <= 22;
          const peakMultiplier = isPeak ? 2.8 : h >= 14 ? 1.5 : 0.7;
          
          const imp = Math.round((baseImpressions / 16) * peakMultiplier * (0.8 + Math.random() * 0.4));
          const vis = Math.round((baseVisits / 16) * peakMultiplier * (0.8 + Math.random() * 0.4));
          const clic = Math.round((baseClicks / 16) * peakMultiplier * (0.8 + Math.random() * 0.4));
          const resv = Math.round((baseReservations / 16) * peakMultiplier * (0.8 + Math.random() * 0.4));

          chartData.push({
            date: hourLabel,
            displayLabel: hourLabel,
            impresiones: imp,
            visitas: vis,
            clic_reservas: clic,
            reservas: resv
          });
        }
      } else {
        const step = daysCount <= 14 ? 1 : daysCount <= 30 ? 1 : daysCount <= 60 ? 2 : 3;
        const totalPoints = Math.min(daysCount, 30);
        
        const monthNamesShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'agos', 'sep', 'oct', 'nov', 'dic'];
        
        for (let i = totalPoints - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - Math.round(i * (daysCount / totalPoints)));
          const dayNum = d.getDate();
          const monthStr = monthNamesShort[d.getMonth()];
          const dateStr = `${dayNum} ${monthStr}`;
          
          const dayOfWeek = d.getDay(); // 0 is Sun, 6 is Sat
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
          const mult = isWeekend ? 1.4 : 0.95;

          const imp = Math.round((baseImpressions / totalPoints) * mult * (0.85 + (Math.sin(i / 2) * 0.15)));
          const vis = Math.round((baseVisits / totalPoints) * mult * (0.85 + (Math.sin(i / 2) * 0.15)));
          const clic = Math.round((baseClicks / totalPoints) * mult * (0.85 + (Math.sin(i / 2) * 0.15)));
          const resv = Math.round((baseReservations / totalPoints) * mult * (0.85 + (Math.sin(i / 2) * 0.15)));

          chartData.push({
            date: dateStr,
            displayLabel: dateStr,
            impresiones: imp,
            visitas: vis,
            clic_reservas: clic,
            reservas: resv
          });
        }
      }

      // Demographic by Sex
      const demographicsSex = {
        men: {
          percentage: 68,
          label: 'Hombres',
          count: Math.round(totalRegisteredUsers * 0.68)
        },
        women: {
          percentage: 32,
          label: 'Mujeres',
          count: Math.round(totalRegisteredUsers * 0.32)
        }
      };

      // Age brackets
      const ageBrackets = [
        { bracket: '15 a 18', totalPct: 8, menPct: 5.5, womenPct: 2.5 },
        { bracket: '19-25', totalPct: 28, menPct: 19.5, womenPct: 8.5 },
        { bracket: '26-35', totalPct: 38, menPct: 25.5, womenPct: 12.5 },
        { bracket: '36-45', totalPct: 16, menPct: 11.0, womenPct: 5.0 },
        { bracket: '46-55', totalPct: 7, menPct: 4.8, womenPct: 2.2 },
        { bracket: '56+', totalPct: 3, menPct: 2.0, womenPct: 1.0 }
      ];

      // Activity Peak Moments by Day of Week
      // Days: 'Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'
      const daysActivity = [
        {
          id: 'do',
          name: 'Domingo',
          short: 'Do',
          peakTime: '17:00 - 21:00 hs',
          peakOccupancy: 88,
          hours: [
            { hour: '08:00', level: 25 }, { hour: '09:00', level: 40 }, { hour: '10:00', level: 65 },
            { hour: '11:00', level: 70 }, { hour: '12:00', level: 60 }, { hour: '13:00', level: 45 },
            { hour: '14:00', level: 40 }, { hour: '15:00', level: 55 }, { hour: '16:00', level: 75 },
            { hour: '17:00', level: 85 }, { hour: '18:00', level: 88 }, { hour: '19:00', level: 86 },
            { hour: '20:00', level: 82 }, { hour: '21:00', level: 70 }, { hour: '22:00', level: 45 }, { hour: '23:00', level: 20 }
          ]
        },
        {
          id: 'lu',
          name: 'Lunes',
          short: 'Lu',
          peakTime: '19:00 - 22:00 hs',
          peakOccupancy: 78,
          hours: [
            { hour: '08:00', level: 15 }, { hour: '09:00', level: 20 }, { hour: '10:00', level: 25 },
            { hour: '11:00', level: 30 }, { hour: '12:00', level: 35 }, { hour: '13:00', level: 40 },
            { hour: '14:00', level: 35 }, { hour: '15:00', level: 40 }, { hour: '16:00', level: 50 },
            { hour: '17:00', level: 65 }, { hour: '18:00', level: 72 }, { hour: '19:00', level: 78 },
            { hour: '20:00', level: 76 }, { hour: '21:00', level: 74 }, { hour: '22:00', level: 58 }, { hour: '23:00', level: 25 }
          ]
        },
        {
          id: 'ma',
          name: 'Martes',
          short: 'Ma',
          peakTime: '19:00 - 22:00 hs',
          peakOccupancy: 82,
          hours: [
            { hour: '08:00', level: 18 }, { hour: '09:00', level: 22 }, { hour: '10:00', level: 28 },
            { hour: '11:00', level: 32 }, { hour: '12:00', level: 38 }, { hour: '13:00', level: 42 },
            { hour: '14:00', level: 38 }, { hour: '15:00', level: 45 }, { hour: '16:00', level: 55 },
            { hour: '17:00', level: 70 }, { hour: '18:00', level: 78 }, { hour: '19:00', level: 82 },
            { hour: '20:00', level: 80 }, { hour: '21:00', level: 78 }, { hour: '22:00', level: 62 }, { hour: '23:00', level: 30 }
          ]
        },
        {
          id: 'mi',
          name: 'Miércoles',
          short: 'Mi',
          peakTime: '19:00 - 22:00 hs',
          peakOccupancy: 89,
          hours: [
            { hour: '08:00', level: 20 }, { hour: '09:00', level: 25 }, { hour: '10:00', level: 30 },
            { hour: '11:00', level: 35 }, { hour: '12:00', level: 40 }, { hour: '13:00', level: 45 },
            { hour: '14:00', level: 40 }, { hour: '15:00', level: 48 }, { hour: '16:00', level: 60 },
            { hour: '17:00', level: 75 }, { hour: '18:00', level: 84 }, { hour: '19:00', level: 89 },
            { hour: '20:00', level: 87 }, { hour: '21:00', level: 84 }, { hour: '22:00', level: 68 }, { hour: '23:00', level: 35 }
          ]
        },
        {
          id: 'ju',
          name: 'Jueves',
          short: 'Ju',
          peakTime: '20:00 - 23:00 hs',
          peakOccupancy: 94,
          hours: [
            { hour: '08:00', level: 22 }, { hour: '09:00', level: 28 }, { hour: '10:00', level: 35 },
            { hour: '11:00', level: 40 }, { hour: '12:00', level: 45 }, { hour: '13:00', level: 50 },
            { hour: '14:00', level: 45 }, { hour: '15:00', level: 55 }, { hour: '16:00', level: 68 },
            { hour: '17:00', level: 80 }, { hour: '18:00', level: 88 }, { hour: '19:00', level: 92 },
            { hour: '20:00', level: 94 }, { hour: '21:00', level: 93 }, { hour: '22:00', level: 75 }, { hour: '23:00', level: 40 }
          ]
        },
        {
          id: 'vi',
          name: 'Viernes',
          short: 'Vi',
          peakTime: '19:00 - 23:30 hs',
          peakOccupancy: 98,
          hours: [
            { hour: '08:00', level: 25 }, { hour: '09:00', level: 30 }, { hour: '10:00', level: 38 },
            { hour: '11:00', level: 45 }, { hour: '12:00', level: 52 }, { hour: '13:00', level: 58 },
            { hour: '14:00', level: 50 }, { hour: '15:00', level: 62 }, { hour: '16:00', level: 75 },
            { hour: '17:00', level: 86 }, { hour: '18:00', level: 94 }, { hour: '19:00', level: 98 },
            { hour: '20:00', level: 98 }, { hour: '21:00', level: 96 }, { hour: '22:00', level: 88 }, { hour: '23:00', level: 55 }
          ]
        },
        {
          id: 'sa',
          name: 'Sábado',
          short: 'Sa',
          peakTime: '16:00 - 21:00 hs',
          peakOccupancy: 96,
          hours: [
            { hour: '08:00', level: 35 }, { hour: '09:00', level: 55 }, { hour: '10:00', level: 75 },
            { hour: '11:00', level: 82 }, { hour: '12:00', level: 78 }, { hour: '13:00', level: 65 },
            { hour: '14:00', level: 60 }, { hour: '15:00', level: 75 }, { hour: '16:00', level: 90 },
            { hour: '17:00', level: 95 }, { hour: '18:00', level: 96 }, { hour: '19:00', level: 95 },
            { hour: '20:00', level: 92 }, { hour: '21:00', level: 85 }, { hour: '22:00', level: 70 }, { hour: '23:00', level: 45 }
          ]
        }
      ];

      res.json({
        period,
        label,
        badges,
        bookingModes,
        chartData,
        demographicsSex,
        ageBrackets,
        daysActivity
      });
    } catch (e: any) {
      console.error('Error fetching exposure stats:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Support Tickets API
  app.get('/api/support-tickets', (req, res) => {
    try {
      const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 50').all();
      res.json(tickets);
    } catch (e: any) {
      console.error('Error fetching support tickets:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/support-tickets', (req, res) => {
    try {
      const {
        type = 'bug',
        priority = 'medium',
        module = 'General',
        title,
        description,
        admin_name = 'Administrador',
        admin_email = '',
        admin_phone = '',
        system_info = '',
        channel = 'whatsapp'
      } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: 'Título y descripción son requeridos' });
      }

      // Generate a unique ticket code like #TK-7392
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const prefix = type === 'bug' ? 'BUG' : type === 'feature' ? 'MEJ' : type === 'urgent' ? 'URG' : 'SUP';
      const ticket_code = `#${prefix}-${randomDigits}`;
      const created_at = new Date().toISOString();

      const insertStmt = db.prepare(`
        INSERT INTO support_tickets 
        (ticket_code, type, priority, module, title, description, admin_name, admin_email, admin_phone, system_info, status, channel, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `);

      const result = insertStmt.run(
        ticket_code,
        type,
        priority,
        module,
        title,
        description,
        admin_name,
        admin_email,
        admin_phone,
        typeof system_info === 'object' ? JSON.stringify(system_info) : system_info,
        channel,
        created_at
      );

      const createdTicket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ success: true, ticket: createdTicket });
    } catch (e: any) {
      console.error('Error creating support ticket:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/support-tickets/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!['pending', 'in_review', 'resolved'].includes(status)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }
      db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run(status, id);
      const updated = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
      res.json({ success: true, ticket: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/support-tickets/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM support_tickets WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => { db.close(); process.exit(); });
process.on('SIGTERM', () => { db.close(); process.exit(); });

