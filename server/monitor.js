
import { record } from './db.js';
import { extractedSchema } from './mcp.js';
import { seedListings } from './catalog.js';

export class Monitor {
  constructor(db, browser) {
    this.db = db;
    this.browser = browser;
    this.running = false;
    this.seconds = 0;
    this.timer = null;
    this.active = null;
  }

  run() {
    if (this.running) {
      return Promise.reject(
        Object.assign(
          new Error('A scan is already running'),
          { status: 409 }
        )
      );
    }

    this.running = true;

    this.active = this.scan().finally(() => {
      this.running = false;
      this.active = null;
    });

    return this.active;
  }

  async scan() {
    const db = this.db;

    const id = Number(
      db.prepare(
        "INSERT INTO runs(started,status) VALUES(?,'running')"
      ).run(new Date().toISOString()).lastInsertRowid
    );

    const errors = [];
    let saved = 0;

    try {
      // Only monitor listings in the current product catalog.
      // Historical listings remain stored in SQLite.
      const activeIds = new Set(
        seedListings().map(listing => listing.id)
      );

      const listings = db
        .prepare('SELECT * FROM listings')
        .all()
        .filter(listing => activeIds.has(listing.id));

      for (const listing of listings) {
        let error;

        // Retry a failed extraction once.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            // Genuine Playwright MCP browser extraction.
            const value = extractedSchema.parse(
              await this.browser.extract(listing.path)
            );

            // Prevent mismatched products from entering history.
            if (value.sku !== listing.sku) {
              throw new Error('Product identity mismatch');
            }

            // Save observation and generate alerts.
            record(db, listing, value, id);

            saved++;
            error = null;
            break;

          } catch (e) {
            error = e;

            await this.browser.close().catch(() => {});
          }
        }

        if (error) {
          errors.push({
            listing: listing.id,
            message: error.message
          });
        }
      }

    } finally {
      db.prepare(
        'UPDATE runs SET finished=?,status=?,errors=? WHERE id=?'
      ).run(
        new Date().toISOString(),
        errors.length
          ? (saved ? 'partial' : 'failed')
          : 'complete',
        JSON.stringify(errors),
        id
      );
    }

    return {
      id,
      saved,
      errors
    };
  }

  schedule(seconds) {
    clearInterval(this.timer);

    this.timer = null;
    this.seconds = seconds;

    this.db.prepare(
      "INSERT INTO settings VALUES('interval',?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).run(String(seconds));

    if (seconds) {
      this.timer = setInterval(() => {
        if (!this.running) {
          this.run().catch(console.error);
        }
      }, seconds * 1000);
    }
  }

  async close() {
    clearInterval(this.timer);

    if (this.active) {
      await this.active;
    }

    await this.browser.close();
  }
}
