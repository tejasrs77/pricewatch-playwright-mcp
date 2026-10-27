
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';

const require = createRequire(import.meta.url);

export const extractedSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1).max(200),
  price: z.number().int().positive().max(100000000),
  currency: z.literal('INR'),
  stock: z.boolean()
});

export function parseResult(result) {
  if (result.isError) {
    throw new Error(
      result.content?.map(c => c.text || '').join('\n') ||
      'MCP tool failed'
    );
  }

  const text = result.content
    ?.filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n') || '';

  const match = text.match(
    /### Result\s*\n([\s\S]*?)(?=\n### |$)/
  );

  const raw = match ? match[1].trim() : text.trim();

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      'Unexpected MCP evaluation response: ' + text.slice(0, 180)
    );
  }
}

export class BrowserMcp {
  constructor({
    origin,
    logPath = 'data/mcp-trace.jsonl'
  }) {
    this.origin = new URL(origin).origin;
    this.logPath = logPath;
    this.client = null;
    this.tools = [];
  }

  trace(event) {
    mkdirSync(dirname(this.logPath), {
      recursive: true
    });

    appendFileSync(
      this.logPath,
      JSON.stringify({
        at: new Date().toISOString(),
        ...event
      }) + '\n'
    );
  }

  async connect() {
    if (this.client) return;

    const cli = join(
      dirname(require.resolve('@playwright/mcp/package.json')),
      'cli.js'
    );

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        cli,
        '--headless',
        '--isolated',
        '--browser',
        'chromium',
        ...(
          process.env.MCP_NO_SANDBOX === 'true'
            ? ['--no-sandbox']
            : []
        )
      ],
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: resolve('data/browsers')
      },
      stderr: 'pipe'
    });

    transport.stderr?.on('data', chunk => {
      this.trace({
        event: 'server-stderr',
        text: chunk.toString().slice(0, 2000)
      });
    });

    const client = new Client({
      name: 'pricewatch-js-client',
      version: '1.0.0'
    });

    try {
      await client.connect(transport);

      const { tools } = await client.listTools();
      this.tools = tools.map(tool => tool.name);

      for (const name of [
        'browser_navigate',
        'browser_evaluate'
      ]) {
        if (!this.tools.includes(name)) {
          throw new Error('Missing MCP tool: ' + name);
        }
      }

      this.client = client;

      this.trace({
        event: 'connected',
        tools: this.tools
      });
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
  }

  async call(name, args) {
    await this.connect();

    if (!this.tools.includes(name)) {
      throw new Error(`MCP tool unavailable: ${name}`);
    }

    const started = Date.now();

    this.trace({
      event: 'tools/call',
      name,
      arguments: args
    });

    try {
      const result = await this.client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: 45000 }
      );

      if (result.isError) {
        throw new Error(
          result.content?.map(c => c.text || '').join('\n') ||
          'MCP error'
        );
      }

      this.trace({
        event: 'tool-result',
        name,
        ok: true,
        durationMs: Date.now() - started
      });

      return result;
    } catch (error) {
      this.trace({
        event: 'tool-result',
        name,
        ok: false,
        durationMs: Date.now() - started,
        error: error.message
      });

      throw error;
    }
  }

  // Validate local demo-store product URLs.
  productUrl(path) {
    const url = new URL(path, this.origin);

    const allowedPath =
      /^\/stores\/(bharattech|indiadeals)\/products\/[a-z0-9-]+$/;

    if (
      url.origin !== this.origin ||
      !allowedPath.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      throw new Error('Unsupported store URL');
    }

    return url;
  }

  // Navigate through the actual MCP browser tool.
  async navigate(path) {
    const url = this.productUrl(path);

    await this.call('browser_navigate', {
      url: url.href
    });

    return url.href;
  }

  // Evaluate a browser-side function through MCP.
  async evaluate(functionSource) {
    const result = await this.call('browser_evaluate', {
      function: functionSource
    });

    return parseResult(result);
  }

  // Reusable product-page assertions.
  async inspectProductPage(path) {
    await this.navigate(path);

    return this.evaluate(`() => {
      const product = document.querySelector('[data-product]');
      const title = product?.querySelector('h1');
      const priceElement = product?.querySelector('[data-price]');

      return {
        pageLoaded: document.readyState === 'complete',
        productFound: Boolean(product),
        titleFound: Boolean(title),
        priceFound: Boolean(priceElement),
        sku: product?.dataset.sku || null,
        name: title?.textContent.trim() || null,
        price: priceElement
          ? Number(priceElement.dataset.price)
          : null,
        currency: product?.dataset.currency || null,
        stock: product?.dataset.stock === 'true',
        url: location.href
      };
    }`);
  }

  // Capture screenshot evidence through Playwright MCP.
  async screenshot(filename = 'evidence.png') {
    await this.connect();

    if (!this.tools.includes('browser_take_screenshot')) {
      throw new Error(
        'The connected Playwright MCP server does not expose browser_take_screenshot'
      );
    }

    if (!/^[a-zA-Z0-9_-]+\.png$/.test(filename)) {
      throw new Error('Invalid screenshot filename');
    }

    const outputPath = resolve(
      'test-results',
      'screenshots',
      filename
    );

    mkdirSync(dirname(outputPath), {
      recursive: true
    });

    const result = await this.call('browser_take_screenshot', {
      filename: outputPath,
      type: 'png'
    });

    return {
      path: outputPath,
      result
    };
  }

  // Existing extraction API preserved for the monitor.
  async extract(path) {
    await this.navigate(path);

    const value = await this.evaluate(`() => {
      const product = document.querySelector('[data-product]');

      if (!product) {
        throw new Error('Product unavailable');
      }

      const title = product.querySelector('h1');
      const priceElement = product.querySelector('[data-price]');

      if (!title || !priceElement) {
        throw new Error('Product details missing');
      }

      return {
        sku: product.dataset.sku,
        name: title.textContent.trim(),
        price: Number(priceElement.dataset.price),
        currency: product.dataset.currency,
        stock: product.dataset.stock === 'true'
      };
    }`);

    return extractedSchema.parse(value);
  }

  async close() {
    const client = this.client;
    this.client = null;

    if (client) {
      await client.close();
    }
  }
}
