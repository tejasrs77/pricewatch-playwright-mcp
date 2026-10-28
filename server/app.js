
import express from 'express';
import { resolve } from 'node:path';
import { z } from 'zod';

import { dashboard, evaluateTarget } from './db.js';
import { storeRouter } from './stores.js';
import { products } from './catalog.js';
import { planWithAi } from './agent.js';
import { TestingEngine } from './testing.js';

export function createApp({
  db,
  monitor,
  origin,
  aiEnabled = false,
  planner = planWithAi
}) {
  const app = express();

  // Initialize MCP automation testing engine.
  // This creates the automation history tables in SQLite.
  const testing = new TestingEngine(
    db,
    monitor.browser,
    monitor
  );

  app.disable('x-powered-by');

  // Validate request host and origin.
  app.use((req, res, next) => {
    const host = req.headers.host;

    const allowedHosts = [
      new URL(origin).host,
      'localhost:' + new URL(origin).port,
      '127.0.0.1:5173',
      'localhost:5173'
    ];

    if (!allowedHosts.includes(host)) {
      return res.status(403).json({
        error: 'Unrecognized host'
      });
    }

    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      ![
        origin,
        'http://localhost:' + new URL(origin).port,
        'http://127.0.0.1:5173',
        'http://localhost:5173'
      ].includes(req.headers.origin)
    ) {
      return res.status(403).json({
        error: 'Unrecognized origin'
      });
    }

    next();
  });

  app.use(express.json({ limit: '8kb' }));

  // Demo storefronts.
  app.use('/stores', storeRouter(db));

  // Health check.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  // Main price-monitoring dashboard.
  app.get('/api/dashboard', (req, res) => {
    res.json({
      ...dashboard(db),
      monitor: {
        running: monitor.running,
        seconds: monitor.seconds
      },
      aiEnabled,
      mcpTools: monitor.browser.tools || []
    });
  });

  // Run price monitoring through Playwright MCP.
  app.post('/api/scan', async (req, res, next) => {
    try {
      if (testing.running) {
        return res.status(409).json({
          error: 'Automation testing is running. Please wait.'
        });
      }

      const { sku } = z.object({ sku: z.enum(products.map(p => p.sku)).optional() }).parse(req.body || {});
      res.json(await monitor.run(sku));
    } catch (error) {
      next(error);
    }
  });

  // Configure automatic price monitoring.
  app.put('/api/schedule', (req, res) => {
    const { seconds } = z.object({
      seconds: z.number().int().refine(
        n => n === 0 || (n >= 30 && n <= 86400)
      )
    }).parse(req.body);

    monitor.schedule(seconds);

    res.json({ seconds });
  });

  // Set a product price target.
  const setTarget = (sku, price) => {
    if (!products.some(p => p.sku === sku)) {
      throw Object.assign(
        new Error('Unknown product'),
        { status: 404 }
      );
    }

    db.prepare(`
      INSERT INTO targets VALUES(?,?)
      ON CONFLICT(sku)
      DO UPDATE SET price=excluded.price
    `).run(sku, price);
    evaluateTarget(db, sku);
  };

  app.put('/api/targets/:sku', (req, res) => {
    const { price } = z.object({
      price: z.number().int().positive().max(100000000)
    }).parse(req.body);

    setTarget(req.params.sku, price);

    res.json({ ok: true });
  });

  app.delete('/api/targets/:sku', (req, res) => {
    db.prepare(
      'DELETE FROM targets WHERE sku=?'
    ).run(req.params.sku);

    res.json({ ok: true });
  });

  // Mark price alerts as read.
  app.post('/api/alerts/read', (req, res) => {
    db.prepare(
      'UPDATE alerts SET seen=1'
    ).run();

    res.json({ ok: true });
  });

  // Modify demo-store prices and availability.
  app.put('/api/demo/:id', (req, res) => {
    const { price, stock } = z.object({
      price: z.number().int().positive().max(100000000),
      stock: z.boolean()
    }).parse(req.body);

    const result = db.prepare(`
      UPDATE demo
      SET price=?, stock=?
      WHERE id=?
    `).run(
      price,
      Number(stock),
      req.params.id
    );

    if (!result.changes) {
      return res.status(404).json({
        error: 'Unknown listing'
      });
    }

    res.json({ ok: true });
  });

  // Reset demo-store prices.
  app.post('/api/demo/reset', (req, res) => {
    for (const p of products) {
      db.prepare(`
        UPDATE demo
        SET price=?, stock=1
        WHERE id=?
      `).run(
        p.prices[0],
        'bharattech:' + p.sku
      );

      db.prepare(`
        UPDATE demo
        SET price=?, stock=1
        WHERE id=?
      `).run(
        p.prices[1],
        'indiadeals:' + p.sku
      );
    }

    res.json({ ok: true });
  });

  // Optional Ollama AI assistant.
  let agentBusy = false;

  app.post('/api/agent', async (req, res, next) => {
    let acquired = false;
    try {
      if (!aiEnabled) {
        return res.status(503).json({
          error: 'AI is disabled. Enable Ollama in .env; ordinary monitoring works without it.'
        });
      }

      const { prompt } = z.object({
        prompt: z.string().trim().min(1).max(1000)
      }).parse(req.body);

      if (agentBusy) {
        return res.status(409).json({
          error: 'AI is processing another request'
        });
      }

      if (testing.running) {
        return res.status(409).json({
          error: 'Automation testing is running. Please wait.'
        });
      }

      agentBusy = true;
      acquired = true;

      const plan = await planner(prompt);

      let result;

      if (plan.action === 'scan') {
        result = await monitor.run(plan.sku);

      } else if (plan.action === 'target') {
        setTarget(
          plan.sku,
          Math.round(plan.targetRupees * 100)
        );

        result = {
          message: 'Target saved. See Alerts for its current monitoring status.'
        };

      } else {
        result = dashboard(db).listings
          .filter(l => !plan.sku || l.sku === plan.sku)
          .map(l => ({
            name: l.name,
            store: l.store,
            price: l.latest?.price ?? null,
            stock: l.latest?.stock ?? null,
            observedAt: l.latest?.observed_at ?? null
          }));
      }

      res.json({ plan, result });

    } catch (error) {
      next(error);
    } finally {
      if (acquired) agentBusy = false;
    }
  });

  // =====================================
  // PLAYWRIGHT MCP AUTOMATION TESTING API
  // =====================================

  // Retrieve scenarios and previous test results.
  app.get('/api/testing', (req, res) => {
    res.json(testing.history());
  });

  // Execute the five automation test scenarios.
  app.post('/api/testing/run', async (req, res, next) => {
    try {
      const result = await testing.run();

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Unknown API endpoints.
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'Unknown endpoint'
    });
  });

  // Serve production React build.
  app.use(express.static(resolve('dist')));

  app.get('/', (req, res) => {
    res.status(503).send(
      'Run npm run build, then refresh. For development use http://127.0.0.1:5173.'
    );
  });

  // Centralized error handling.
  app.use((err, req, res, next) => {
    const status = err instanceof z.ZodError
      ? 400
      : err.status || 500;

    res.status(status).json({
      error: err instanceof z.ZodError
        ? 'Invalid input: ' +
          err.issues
            .map(i => i.path.join('.') + ' ' + i.message)
            .join('; ')
        : err.message
    });
  });

  return app;
}
