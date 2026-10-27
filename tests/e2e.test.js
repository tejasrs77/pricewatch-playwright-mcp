
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdirSync,
  existsSync
} from 'node:fs';

import { fixture } from './helpers.js';
import { parseResult, BrowserMcp } from '../server/mcp.js';
import { products } from '../server/catalog.js';

test(
  'real Playwright MCP: extraction → SQLite → alerts → React dashboard',
  { timeout: 240000 },
  async () => {
    mkdirSync('test-results', { recursive: true });

    const f = await fixture({ real: true });

    const uiBrowser = new BrowserMcp({
      origin: f.origin,
      logPath: 'test-results/ui-mcp-trace.jsonl'
    });

    const product = products[0];
    const sku = product.sku;
    const listingId = `bharattech:${sku}`;

    try {
      // Restrict this E2E fixture to one product in two stores.
      // The application still supports the full catalog.
      f.db.prepare(
        'DELETE FROM demo WHERE id NOT IN (?, ?)'
      ).run(
        `bharattech:${sku}`,
        `indiadeals:${sku}`
      );

      f.db.prepare(
        'DELETE FROM listings WHERE sku != ?'
      ).run(sku);

      const expectedListings = f.db.prepare(
        'SELECT COUNT(*) AS count FROM listings'
      ).get().count;

      assert.equal(expectedListings, 2);

      // First real MCP scan
      const first = await f.monitor.run();

      assert.equal(
        first.saved,
        expectedListings,
        JSON.stringify(first.errors)
      );

      assert.equal(first.errors.length, 0);

      // Verify genuine Playwright MCP tools
      assert.ok(
        f.browser.tools.includes('browser_navigate')
      );

      assert.ok(
        f.browser.tools.includes('browser_evaluate')
      );

      // Get the initial observed price
      const initial = (
        await f.request('/api/dashboard')
      ).body;

      const initialPrice = initial.listings.find(
        l => l.id === listingId
      ).latest.price;

      // Set a target below the initial price.
      const targetPrice = Math.max(
        1,
        initialPrice - 5000
      );

      const targetResponse = await f.request(
        `/api/targets/${sku}`,
        'PUT',
        { price: targetPrice }
      );

      assert.equal(targetResponse.status, 200);

      // Simulate a price drop that crosses the target
      const reducedPrice = Math.max(
        1,
        targetPrice - 1000
      );

      const update = await f.request(
        `/api/demo/${listingId}`,
        'PUT',
        {
          price: reducedPrice,
          stock: true
        }
      );

      assert.equal(update.status, 200);

      // Second real MCP scan
      const second = await f.monitor.run();

      assert.equal(
        second.saved,
        expectedListings,
        JSON.stringify(second.errors)
      );

      assert.equal(second.errors.length, 0);

      // Verify SQLite history and generated alerts
      const dashboard = (
        await f.request('/api/dashboard')
      ).body;

      const listing = dashboard.listings.find(
        l => l.id === listingId
      );

      assert.equal(
        listing.latest.price,
        reducedPrice
      );

      assert.equal(
        listing.history.length,
        2
      );

      assert.ok(
        dashboard.alerts.some(
          a =>
            a.listing_id === listingId &&
            a.kind === 'drop'
        ),
        'Expected a price-drop alert'
      );

      assert.ok(
        dashboard.alerts.some(
          a =>
            a.listing_id === listingId &&
            a.kind === 'target'
        ),
        'Expected a target-price alert'
      );

      // Navigate to the React dashboard using MCP
      await uiBrowser.call(
        'browser_navigate',
        { url: f.origin }
      );

      const ui = parseResult(
        await uiBrowser.call(
          'browser_evaluate',
          {
            function: `async () => {
              for (
                let i = 0;
                i < 100 &&
                !document.querySelector('.product');
                i++
              ) {
                await new Promise(
                  resolve => setTimeout(resolve, 100)
                );
              }

              return {
                title: document.title,
                products: document.querySelectorAll(
                  '.product'
                ).length,
                alerts: document.querySelectorAll(
                  '.alert'
                ).length,
                charts: document.querySelectorAll(
                  'svg'
                ).length
              };
            }`
          }
        )
      );

      assert.equal(ui.products, 1);

      assert.ok(
        ui.alerts >= 2,
        'Expected price-drop and target alerts in UI'
      );

      assert.ok(
        ui.charts >= 2,
        'Expected price-history charts'
      );

      // Click Scan Now in the React dashboard.
      // This is a real browser interaction through MCP.
      const scan = parseResult(
        await uiBrowser.call(
          'browser_evaluate',
          {
            function: `async () => {
              const button = document.querySelector(
                'button.primary'
              );

              if (!button) {
                throw new Error('Scan button not found');
              }

              button.click();

              for (let i = 0; i < 900; i++) {
                await new Promise(
                  resolve => setTimeout(resolve, 100)
                );

                const status = document.querySelector(
                  '[role="status"]'
                );

                if (
                  status &&
                  status.textContent.includes('Scan complete')
                ) {
                  return status.textContent;
                }
              }

              throw new Error('UI scan did not finish');
            }`
          }
        )
      );

      assert.match(scan, /Scan complete/);

      // Reload dashboard
      await uiBrowser.call(
        'browser_navigate',
        { url: f.origin }
      );

      await uiBrowser.call(
        'browser_evaluate',
        {
          function: `async () => {
            for (
              let i = 0;
              i < 100 &&
              !document.querySelector('.product');
              i++
            ) {
              await new Promise(
                resolve => setTimeout(resolve, 100)
              );
            }

            return true;
          }`
        }
      );

      // Desktop screenshot
      await uiBrowser.call(
        'browser_take_screenshot',
        {
          type: 'png',
          filename: 'test-results/dashboard.png',
          fullPage: true
        }
      );

      // Mobile responsiveness
      await uiBrowser.call(
        'browser_resize',
        {
          width: 390,
          height: 844
        }
      );

      const mobile = parseResult(
        await uiBrowser.call(
          'browser_evaluate',
          {
            function: `() => ({
              width: innerWidth,
              content: document.documentElement.scrollWidth
            })`
          }
        )
      );

      assert.ok(
        mobile.content <= mobile.width,
        'Mobile page must not overflow horizontally'
      );

      // Mobile screenshot
      await uiBrowser.call(
        'browser_take_screenshot',
        {
          type: 'png',
          filename: 'test-results/mobile.png',
          fullPage: true
        }
      );

      // Verify actual MCP calls were logged
      const trace = readFileSync(
        'test-results/mcp-trace.jsonl',
        'utf8'
      );

      assert.match(
        trace,
        /"event":"connected"/
      );

      assert.match(
        trace,
        /"name":"browser_navigate"/
      );

      assert.match(
        trace,
        /"name":"browser_evaluate"/
      );

      assert.ok(
        existsSync('test-results/dashboard.png')
      );

      assert.ok(
        existsSync('test-results/mobile.png')
      );

    } finally {
      await uiBrowser.close();
      await f.close();
    }
  }
);
