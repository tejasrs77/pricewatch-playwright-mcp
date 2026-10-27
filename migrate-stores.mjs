
import { DatabaseSync } from 'node:sqlite';
import { seedListings } from './server/catalog.js';

const db = new DatabaseSync('data/pricewatch.sqlite');

const replacements = {
  techmart: 'bharattech',
  dealbay: 'indiadeals'
};

const validListings = seedListings();
const validIds = new Set(validListings.map(l => l.id));

try {
  db.exec('PRAGMA foreign_keys = ON');

  const running = db.prepare(
    "SELECT COUNT(*) AS count FROM runs WHERE status = 'running'"
  ).get().count;

  if (running) {
    throw new Error('Stop active monitoring before migration.');
  }

  db.exec('BEGIN IMMEDIATE');

  // Rename listing IDs while preserving dependent records.
  // SQLite ON UPDATE CASCADE is not configured, so temporarily
  // defer foreign-key validation until transaction commit.
  db.exec('PRAGMA defer_foreign_keys = ON');

  for (const [oldStore, newStore] of Object.entries(replacements)) {
    const rows = db.prepare(
      'SELECT * FROM listings WHERE store = ?'
    ).all(oldStore);

    for (const row of rows) {
      const newId = `${newStore}:${row.sku}`;

      // Historical products not in the current catalog are
      // retained rather than deleting observations and alerts.
      const newPath = `/stores/${newStore}/products/${row.sku}`;

      const exists = db.prepare(
        'SELECT id FROM listings WHERE id = ?'
      ).get(newId);

      if (exists) {
        throw new Error(
          `Conflicting listing already exists: ${newId}`
        );
      }

      db.prepare(`
        UPDATE listings
        SET id = ?, store = ?, path = ?
        WHERE id = ?
      `).run(newId, newStore, newPath, row.id);

      db.prepare(
        'UPDATE demo SET id = ? WHERE id = ?'
      ).run(newId, row.id);

      db.prepare(
        'UPDATE observations SET listing_id = ? WHERE listing_id = ?'
      ).run(newId, row.id);

      db.prepare(
        'UPDATE alerts SET listing_id = ? WHERE listing_id = ?'
      ).run(newId, row.id);
    }
  }

  // Ensure all current catalog listings exist.
  for (const listing of validListings) {
    db.prepare(`
      INSERT OR IGNORE INTO listings
      (id, sku, name, store, path)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      listing.id,
      listing.sku,
      listing.name,
      listing.store,
      listing.path
    );

    db.prepare(`
      INSERT OR IGNORE INTO demo
      (id, price, stock)
      VALUES (?, ?, 1)
    `).run(listing.id, listing.price);
  }

  const foreignKeyProblems = db.prepare(
    'PRAGMA foreign_key_check'
  ).all();

  if (foreignKeyProblems.length) {
    throw new Error(
      'Foreign key validation failed: ' +
      JSON.stringify(foreignKeyProblems)
    );
  }

  db.exec('COMMIT');

  const summary = db.prepare(`
    SELECT store, COUNT(*) AS count
    FROM listings
    GROUP BY store
  `).all();

  const historical = db.prepare(
    'SELECT COUNT(*) AS count FROM listings'
  ).get().count - validIds.size;

  console.log('Migration completed successfully.');
  console.log('Listings by store:', summary);
  console.log('Additional historical listings retained:', historical);

} catch (error) {
  if (db.isTransaction) {
    db.exec('ROLLBACK');
  }

  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
