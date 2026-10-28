
import { z } from 'zod';
import { products } from './catalog.js';

const validSkus = products.map(product => product.sku);

const catalogDescription = products
  .map(product => `${product.name} (${product.sku})`)
  .join('\n');

const planSchema = z.object({
  action: z.enum(['compare', 'scan', 'target']),
  sku: z.enum(validSkus).nullable(),
  targetRupees: z.number()
    .positive()
    .max(1000000)
    .nullable()
}).strict();

// Normalize user text for product matching.
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Match only products available in our catalog.
function matchProduct(prompt) {
  const text = ` ${normalize(prompt)} `;

  const matches = products.filter(product => {
    const name = normalize(product.name);
    const sku = normalize(product.sku);

    return text.includes(` ${name} `) ||
      text.includes(` ${sku} `);
  });

  // Do not guess when multiple products match.
  return matches.length === 1 ? matches[0] : null;
}

// Extract an explicitly stated price.
function extractTargetPrice(prompt) {
  const text = String(prompt);

  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i,
    /(?:target(?:\s+price)?|below|under|reaches|drops?\s+to)\s*(?:of|at|to|is)?\s*([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:rupees|inr)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      const amount = Number(
        match[1].replace(/,/g, '')
      );

      if (
        Number.isFinite(amount) &&
        amount > 0 &&
        amount <= 1000000
      ) {
        return amount;
      }
    }
  }

  return null;
}

// Handle clear commands without slow AI inference.
function detectDirectAction(prompt) {
  const text = String(prompt).toLowerCase();
  const product = matchProduct(prompt);

  const hasScan =
    /\b(scan|rescan|re-scan|refresh|check prices|check stores)\b/i
      .test(text);

  const hasTarget =
    /\b(alert|notify|notification|target price|price drops|price falls)\b/i
      .test(text);

  const hasCompare =
    /\b(compare|comparison|cheapest|lowest price|best price)\b/i
      .test(text);

  const hasProductReference =
    products.some(product => {
      const normalized = ` ${normalize(prompt)} `;

      return normalized.includes(
        ` ${normalize(product.name)} `
      ) || normalized.includes(
        ` ${normalize(product.sku)} `
      );
    });

  // Ambiguous product references go to Ollama.
  if (hasProductReference && !product) {
    return null;
  }

  // Alert creation requires a valid product and price.
  if (hasTarget && !hasScan) {
    const targetRupees = extractTargetPrice(prompt);

    if (product && targetRupees !== null) {
      return planSchema.parse({
        action: 'target',
        sku: product.sku,
        targetRupees
      });
    }

    // Let Ollama interpret incomplete requests.
    return null;
  }

  // Explicit scanning takes priority over comparison.
  if (hasScan) {
    return planSchema.parse({
      action: 'scan',
      sku: product?.sku ?? null,
      targetRupees: null
    });
  }

  if (hasCompare) {
    return planSchema.parse({
      action: 'compare',
      sku: product?.sku ?? null,
      targetRupees: null
    });
  }

  return null;
}

export async function planWithAi(
  prompt,
  {
    fetcher = fetch,
    model = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
  } = {}
) {
  // Fast path: no Ollama request needed.
  const directPlan = detectDirectAction(prompt);

  if (directPlan) {
    return directPlan;
  }

  const systemPrompt = `
You are the AI planning assistant for PriceWatch,
an e-commerce price monitoring system.

Convert the user's request into exactly one JSON object.

REQUIRED JSON FORMAT:

{
  "action": "compare",
  "sku": null,
  "targetRupees": null
}

AVAILABLE ACTIONS:

1. compare
   Compare existing observed prices across stores.
   Does not start a new scan.

2. scan
   Trigger the Playwright MCP price scanning workflow.
   Use this when the user requests a fresh scan,
   refresh, or updated store prices.

3. target
   Save a price alert for a specific product.
   Requires a valid SKU and positive targetRupees.

AVAILABLE PRODUCTS:

${catalogDescription}

RULES:

- Return valid JSON only.
- Only use SKUs from the catalog.
- Never invent products or prices.
- Use null SKU when no specific product is mentioned.
- Use null targetRupees unless action is target.
- All target prices are in Indian rupees.
- Do not include explanations or extra properties.
- If unclear, choose compare with null fields.

EXAMPLES:

User: Compare all products
Output:
{"action":"compare","sku":null,"targetRupees":null}

User: Scan all stores
Output:
{"action":"scan","sku":null,"targetRupees":null}

User: Scan ${products[0].name} and find the lowest price
Output:
{"action":"scan","sku":"${products[0].sku}","targetRupees":null}

User: Compare ${products[0].name}
Output:
{"action":"compare","sku":"${products[0].sku}","targetRupees":null}

User: Alert me when ${products[0].name} reaches 20000 rupees
Output:
{"action":"target","sku":"${products[0].sku}","targetRupees":20000}
`;

  let response;

  try {
    response = await fetcher(
      'http://127.0.0.1:11434/api/chat',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        signal: AbortSignal.timeout(60000),

        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',

          options: {
            temperature: 0,
            num_predict: 100
          },

          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      }
    );

  } catch {
    throw Object.assign(
      new Error(
        'Cannot reach Ollama or request timed out. Start Ollama and check the configured model.'
      ),
      { status: 503 }
    );
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(
        'Ollama returned ' + response.status
      ),
      { status: 502 }
    );
  }

  const data = await response.json();

  let plan;

  try {
    plan = planSchema.parse(
      JSON.parse(data.message?.content)
    );
  } catch {
    throw Object.assign(
      new Error(
        'AI returned an invalid action. Please try a clearer request.'
      ),
      { status: 502 }
    );
  }

  if (
    plan.action === 'target' &&
    (!plan.sku || !plan.targetRupees)
  ) {
    throw Object.assign(
      new Error(
        'Please specify a product and target price.'
      ),
      { status: 400 }
    );
  }

  return plan;
}
