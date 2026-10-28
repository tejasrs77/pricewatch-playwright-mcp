import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seedListings } from './catalog.js';

export function openDatabase(path = 'data/pricewatch.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL, store TEXT NOT NULL, path TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS demo(id TEXT PRIMARY KEY REFERENCES listings(id), price INTEGER NOT NULL CHECK(price>0), stock INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS targets(sku TEXT PRIMARY KEY, price INTEGER NOT NULL CHECK(price>0));
    CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, started TEXT NOT NULL, finished TEXT, status TEXT NOT NULL, errors TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), run_id INTEGER NOT NULL REFERENCES runs(id), price INTEGER NOT NULL CHECK(price>0), stock INTEGER NOT NULL, currency TEXT NOT NULL, observed_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS observations_listing ON observations(listing_id,id DESC);
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), observation_id INTEGER NOT NULL REFERENCES observations(id), kind TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, UNIQUE(observation_id,kind));
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  // A process interrupted during a scan must not leave a permanently running record.
  db.prepare("UPDATE runs SET status='interrupted', finished=? WHERE status='running'").run(new Date().toISOString());
  for (const l of seedListings()) {
    db.prepare('INSERT OR IGNORE INTO listings VALUES(?,?,?,?,?)').run(l.id,l.sku,l.name,l.store,l.path);
    db.prepare('INSERT OR IGNORE INTO demo(id,price) VALUES(?,?)').run(l.id,l.price);
  }
  return db;
}
export function latest(db, id) {
  return db.prepare('SELECT * FROM observations WHERE listing_id=? ORDER BY id DESC LIMIT 1').get(id);
}
export function record(db, listing, value, runId) {
  const before = latest(db, listing.id);
  const target = db.prepare('SELECT price FROM targets WHERE sku=?').get(listing.sku)?.price;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const id = Number(db.prepare('INSERT INTO observations(listing_id,run_id,price,stock,currency,observed_at) VALUES(?,?,?,?,?,?)')
      .run(listing.id,runId,value.price,Number(value.stock),value.currency,now).lastInsertRowid);
    const add = (kind,message) => db.prepare('INSERT INTO alerts(listing_id,observation_id,kind,message,created_at) VALUES(?,?,?,?,?)').run(listing.id,id,kind,message,now);
    if (value.stock && before?.stock && value.price < before.price)
      add('drop', listing.name + ' at ' + listing.store + ' dropped ₹' + ((before.price-value.price)/100).toFixed(2));
    if (value.stock && target && value.price <= target && (!before || !before.stock || before.price > target))
      add('target',listing.name + ' reached your target at ' + listing.store);
    db.exec('COMMIT');
    return id;
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
export function evaluateTarget(db, sku) {
  const target = db.prepare('SELECT price FROM targets WHERE sku=?').get(sku)?.price;
  for (const l of db.prepare('SELECT * FROM listings WHERE sku=?').all(sku)) {
    const o = latest(db, l.id);
    if (o?.stock && o.price <= target)
      db.prepare('INSERT OR IGNORE INTO alerts(listing_id,observation_id,kind,message,created_at) VALUES(?,?,?,?,?)')
        .run(l.id, o.id, 'target', l.name + ' reached your target at ' + l.store, new Date().toISOString());
  }
}
export function dashboard(db) {
  const listings = db.prepare('SELECT * FROM listings ORDER BY sku,store').all().map(l => ({
    ...l, latest: latest(db,l.id) ?? null,
    target: db.prepare('SELECT price FROM targets WHERE sku=?').get(l.sku)?.price ?? null,
    history: db.prepare('SELECT price,stock,observed_at FROM (SELECT * FROM observations WHERE listing_id=? ORDER BY id DESC LIMIT 60) ORDER BY id').all(l.id)
  }));
  const targets = db.prepare('SELECT * FROM targets').all().map(t => {
    const matches = listings.filter(l => l.sku === t.sku);
    const prices = matches.filter(l => l.latest?.stock).map(l => l.latest.price);
    const bestPrice = prices.length ? Math.min(...prices) : null;
    return { ...t, name: matches[0]?.name || t.sku, bestPrice,
      status: bestPrice !== null && bestPrice <= t.price ? 'Triggered' : 'Monitoring' };
  });
  return { listings, targets, alerts: db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 100').all(),
    runs: db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 20').all().map(r => ({...r, errors: JSON.parse(r.errors)})) };
}
