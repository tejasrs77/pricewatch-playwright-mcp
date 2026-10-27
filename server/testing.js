
import { seedListings } from './catalog.js';

const scenarios = [
  'Product page loads',
  'Correct product identity',
  'Valid INR price',
  'Stock information available',
  'Both demo stores have valid listings'
];

export class TestingEngine {
  constructor(db, browser, monitor) {
    this.db = db;
    this.browser = browser;
    this.monitor = monitor;
    this.running = false;

    db.exec(`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id INTEGER PRIMARY KEY,
        started TEXT NOT NULL,
        finished TEXT,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS automation_results (
        id INTEGER PRIMARY KEY,
        run_id INTEGER NOT NULL REFERENCES automation_runs(id),
        scenario TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        details TEXT NOT NULL
      );
    `);
  }

  history() {
    const runs = this.db.prepare(`
      SELECT * FROM automation_runs
      ORDER BY id DESC LIMIT 20
    `).all();

    return {
      running: this.running,
      scenarios,
      runs: runs.map(run => ({
        ...run,
        results: this.db.prepare(`
          SELECT scenario, status, duration_ms, details
          FROM automation_results
          WHERE run_id = ?
          ORDER BY id
        `).all(run.id)
      }))
    };
  }

  async run() {
    if (this.running || this.monitor.running) {
      throw Object.assign(
        new Error('Browser is busy. Wait for the current task.'),
        { status: 409 }
      );
    }

    this.running = true;

    const runId = Number(
      this.db.prepare(`
        INSERT INTO automation_runs(started, status)
        VALUES (?, 'running')
      `).run(new Date().toISOString()).lastInsertRowid
    );

    const save = (scenario, status, duration, details) => {
      this.db.prepare(`
        INSERT INTO automation_results
        (run_id, scenario, status, duration_ms, details)
        VALUES (?, ?, ?, ?, ?)
      `).run(runId, scenario, status, duration, details);
    };

    const execute = async (name, assertion) => {
      const start = Date.now();

      try {
        await assertion();

        save(name, 'passed', Date.now() - start, 'Assertion passed');
      } catch (error) {
        save(name, 'failed', Date.now() - start, error.message);
      }
    };

    try {
      const catalog = seedListings();
      const first = catalog.find(x => x.store === 'bharattech');
      const second = catalog.find(
        x => x.store === 'indiadeals' && x.sku === first.sku
      );

      let product;

      await execute(scenarios[0], async () => {
        product = await this.browser.inspectProductPage(first.path);

        if (!product.pageLoaded || !product.productFound) {
          throw new Error('Product page did not load correctly');
        }
      });

      await execute(scenarios[1], async () => {
        product = await this.browser.inspectProductPage(first.path);

        if (product.sku !== first.sku || !product.name) {
          throw new Error('Product identity mismatch');
        }
      });

      await execute(scenarios[2], async () => {
        product = await this.browser.inspectProductPage(first.path);

        if (
          !Number.isInteger(product.price) ||
          product.price <= 0 ||
          product.currency !== 'INR'
        ) {
          throw new Error('Invalid price or currency');
        }
      });

      await execute(scenarios[3], async () => {
        await this.browser.navigate(first.path);

        const stock = await this.browser.evaluate(`() => {
          const product = document.querySelector('[data-product]');
          return product?.dataset.stock ?? null;
        }`);

        if (!['true', 'false'].includes(stock)) {
          throw new Error('Stock attribute missing or invalid');
        }
      });

      await execute(scenarios[4], async () => {
        const a = await this.browser.extract(first.path);
        const b = await this.browser.extract(second.path);

        if (a.sku !== b.sku || a.currency !== b.currency) {
          throw new Error('Store listings are inconsistent');
        }
      });

      const failed = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM automation_results
        WHERE run_id = ? AND status = 'failed'
      `).get(runId).count;

      this.db.prepare(`
        UPDATE automation_runs
        SET finished = ?, status = ?
        WHERE id = ?
      `).run(
        new Date().toISOString(),
        failed ? 'failed' : 'passed',
        runId
      );

      return this.history().runs[0];
    } catch (error) {
      this.db.prepare(`
        UPDATE automation_runs
        SET finished = ?, status = 'failed'
        WHERE id = ?
      `).run(new Date().toISOString(), runId);

      throw error;
    } finally {
      this.running = false;
      await this.browser.close().catch(() => {});
    }
  }
}
