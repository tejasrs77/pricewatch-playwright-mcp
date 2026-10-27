
import { z } from 'zod';
import { products } from './catalog.js';

// Read valid product SKUs directly from the catalog
const validSkus = products.map(product => product.sku);

// Create a readable product list for the AI
const catalogDescription = products
  .map(product => `${product.name} (${product.sku})`)
  .join('\n');

// Validate the AI-generated action
const planSchema = z.object({
  action: z.enum(['compare', 'scan', 'target']),

  sku: z.enum(validSkus).nullable(),

  targetRupees: z.number()
    .positive()
    .max(1000000)
    .nullable()
}).strict();

export async function planWithAi(
  prompt,
  {
    fetcher = fetch,
    model = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
  } = {}
) {
  const systemPrompt = `
You are the AI planning assistant for PriceWatch,
an e-commerce price monitoring system.

Your job is to convert a user's request into exactly
one JSON object.

The JSON object must contain these three fields:

{
  "action": "compare | scan | target",
  "sku": "valid product SKU or null",
  "targetRupees": "positive number or null"
}

AVAILABLE ACTIONS:

1. compare
   Compare observed product prices across stores.
   Use null SKU to compare all products.

2. scan
   Trigger the Playwright MCP price monitoring workflow.
   Use null SKU unless a product is specifically mentioned.

3. target
   Set a target price for a specific product.
   Both SKU and targetRupees must be provided.

AVAILABLE PRODUCTS:

${catalogDescription}

RULES:

- Only use SKUs from the available product list.
- Match product names to their corresponding SKUs.
- Never invent product SKUs.
- Never invent prices.
- Use null for targetRupees unless action is target.
- Target prices must be expressed in Indian rupees.
- Never generate code, shell commands, or URLs.
- Do not add extra JSON properties.
- Return valid JSON only.
- If the request is unclear, choose compare with null fields.

EXAMPLES:

User: Compare all products
Output:
{"action":"compare","sku":null,"targetRupees":null}

User: Scan all stores
Output:
{"action":"scan","sku":null,"targetRupees":null}

User: Compare ${products[0].name}
Output:
{"action":"compare","sku":"${products[0].sku}","targetRupees":null}

User: Alert me when ${products[0].name} reaches 20000 rupees
Output:
{"action":"target","sku":"${products[0].sku}","targetRupees":20000}
`;

  const response = await fetcher(
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
          temperature: 0
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

  if (!response.ok) {
    throw Object.assign(
      new Error('Ollama returned ' + response.status),
      { status: 502 }
    );
  }

  const data = await response.json();

  const plan = planSchema.parse(
    JSON.parse(data.message?.content)
  );

  if (
    plan.action === 'target' &&
    (!plan.sku || !plan.targetRupees)
  ) {
    throw Object.assign(
      new Error('Please specify a product and target price.'),
      { status: 400 }
    );
  }

  return plan;
}
