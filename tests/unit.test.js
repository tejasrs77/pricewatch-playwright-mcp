
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openDatabase,
  record,
  dashboard
} from '../server/db.js';

import {
  parseResult,
  extractedSchema,
  BrowserMcp
} from '../server/mcp.js';

import { Monitor } from '../server/monitor.js';
import { planWithAi } from '../server/agent.js';
import { products, seedListings } from '../server/catalog.js';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const productCount = products.length;
const listingCount = seedListings().length;
const testSku = products[0].sku;

test('MCP result parsing and invalid prices', () => {
  assert.deepEqual(
    parseResult({
      content: [{
        type: 'text',
        text: '### Result\n{"price":100}\n### Ran Playwright code\n...'
      }]
    }),
    { price: 100 }
  );

  assert.equal(
    parseResult({
      content: [{
        type: 'text',
        text: '### Result\n"plain text"'
      }]
    }),
    'plain text'
  );

  assert.throws(
    () => parseResult({
      isError: true,
      content: [{ text: 'Navigation failed' }]
    }),
    /Navigation failed/
  );

  assert.throws(
    () => extractedSchema.parse({
      sku: 'x',
      name: 'x',
      price: -1,
      currency: 'INR',
      stock: true
    })
  );

  assert.throws(
    () => extractedSchema.parse({
      sku: 'x',
      name: 'x',
      price: 2.3,
      currency: 'USD',
      stock: true
    })
  );
});

test('target crossing, drop detection, no repeat alert, stock exclusion', () => {
  const db = openDatabase(':memory:');

  try {
    const listing = db.prepare(
      'SELECT * FROM listings LIMIT 1'
    ).get();

    const run = Number(
      db.prepare(
        "INSERT INTO runs(started,status) VALUES('now','running')"
      ).run().lastInsertRowid
    );

    db.prepare(
      'INSERT INTO targets VALUES(?,?)'
    ).run(listing.sku, 200000);

    const save = (price, stock = true) =>
      record(
        db,
        listing,
        {
          price,
          stock,
          currency: 'INR'
        },
        run
      );

    save(250000);
    save(190000);
    save(190000);

    assert.equal(dashboard(db).alerts.length, 2);

    save(180000, false);

    assert.equal(dashboard(db).alerts.length, 2);

    save(180000, true);

    assert.equal(
      dashboard(db).alerts.filter(a => a.kind === 'target').length,
      2
    );

    save(240000);
    save(190000);

    assert.equal(dashboard(db).alerts.length, 5);
  } finally {
    db.close();
  }
});

test('SQLite persistence and interrupted run recovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pricewatch-'));
  const file = join(dir, 'test.sqlite');

  try {
    let db = openDatabase(file);

    db.prepare(
      'INSERT INTO targets VALUES(?,?)'
    ).run(testSku, 200000);

    db.prepare(
      "INSERT INTO runs(started,status) VALUES('now','running')"
    ).run();

    db.close();

    db = openDatabase(file);

    assert.equal(
      db.prepare('SELECT price FROM targets WHERE sku=?')
        .get(testSku).price,
      200000
    );

    assert.equal(
      db.prepare('SELECT status FROM runs').get().status,
      'interrupted'
    );

    db.close();
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});

test('unsupported URL is rejected before browser launch', async () => {
  const browser = new BrowserMcp({
    origin: 'http://127.0.0.1:3000'
  });

  await assert.rejects(
    browser.extract('https://example.com/'),
    /Unsupported/
  );

  await assert.rejects(
    browser.extract('/api/health'),
    /Unsupported/
  );
});

test('scan concurrency, retries, partial failure and lock release', async () => {
  const db = openDatabase(':memory:');
  let calls = 0;

  const monitor = new Monitor(db, {
    async close() {},

    async extract(path) {
      calls++;

      await new Promise(resolve => setTimeout(resolve, 3));

      if (path.includes('bharattech')) {
        throw new Error('store unavailable');
      }

      return {
        sku: path.split('/').at(-1),
        name: 'test',
        price: 100,
        stock: true,
        currency: 'INR'
      };
    }
  });

  try {
    const first = monitor.run();

    await assert.rejects(
      monitor.run(),
      /already running/
    );

    const result = await first;

    assert.equal(result.saved, productCount);
    assert.equal(result.errors.length, productCount);

    // Each BharatTech Demo listing is attempted three times;
    // each IndiaDeals Demo listing succeeds on its first attempt.
    assert.equal(calls, productCount * 3);

    assert.equal(monitor.running, false);

    assert.equal(
      dashboard(db).runs[0].status,
      'partial'
    );

    monitor.schedule(30);

    assert.equal(monitor.seconds, 30);

    monitor.schedule(0);
  } finally {
    await monitor.close();
    db.close();
  }
});

test('AI JSON planning is validated and rejects invented actions', async () => {
  const fake = content => async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify(content)
      }
    })
  });

  const plan = await planWithAi(
    'headphone target 2000',
    {
      fetcher: fake({
        action: 'target',
        sku: testSku,
        targetRupees: 2000
      })
    }
  );

  assert.equal(plan.targetRupees, 2000);

  await assert.rejects(
    planWithAi('bad', {
      fetcher: fake({
        action: 'shell',
        sku: null,
        targetRupees: null
      })
    })
  );

  await assert.rejects(
    planWithAi('bad', {
      fetcher: fake({
        action: 'target',
        sku: null,
        targetRupees: null
      })
    })
  );

  await assert.rejects(
    planWithAi('bad', {
      fetcher: async () => ({
        ok: false,
        status: 503
      })
    }),
    /503/
  );
});

test('scheduler performs a real monitor cycle on a timer tick', async t => {
  const db = openDatabase(':memory:');

  const monitor = new Monitor(db, {
    async close() {},

    async extract(path) {
      return {
        sku: path.split('/').at(-1),
        name: 'test',
        price: 100,
        stock: true,
        currency: 'INR'
      };
    }
  });

  t.mock.timers.enable({
    apis: ['setInterval']
  });

  try {
    monitor.schedule(30);

    t.mock.timers.tick(30000);

    await monitor.active;

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM observations'
      ).get().n,
      listingCount
    );

    monitor.schedule(0);

    t.mock.timers.tick(30000);

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM runs'
      ).get().n,
      1
    );
  } finally {
    await monitor.close();
    t.mock.timers.reset();
    db.close();
  }
});

test('identity mismatch cannot enter price history', async () => {
  const db = openDatabase(':memory:');

  const monitor = new Monitor(db, {
    async close() {},

    async extract() {
      return {
        sku: 'wrong-model',
        name: 'Wrong',
        price: 100,
        stock: true,
        currency: 'INR'
      };
    }
  });

  try {
    const result = await monitor.run();

    assert.equal(result.saved, 0);

    assert.equal(
      result.errors.length,
      listingCount
    );

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM observations'
      ).get().n,
      0
    );
  } finally {
    await monitor.close();
    db.close();
  }
});
