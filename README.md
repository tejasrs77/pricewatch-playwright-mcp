# Pricewatch — AI-enhanced E-Commerce Monitoring with Playwright MCP

A complete Windows / VS Code college mini-project. The monitor launches Microsoft's **real Playwright MCP server** and uses a JavaScript MCP SDK client over stdio. It visits two local shopping stores, extracts rendered product data, stores SQLite observations, compares matching products, and raises in-app alerts. A local Ollama language model can optionally turn plain English into validated actions.

**Core monitoring needs no API key, AI model, or internet after installation. MCP itself is not AI.** Optional AI interprets requests; deterministic code extracts and validates prices.

## 1. Windows setup (PowerShell)

Install Node.js **24 or newer** and VS Code. Extract this project to a folder such as `C:\Projects\pricewatch`. Open that folder in VS Code: File → Open Folder, then Terminal → New Terminal.

Run from the folder containing `package.json`:

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run browser:install
Copy-Item .env.example .env
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3000**. Stop with Ctrl+C. Use `npm.cmd` to avoid the Windows npm.ps1 execution-policy problem. Keep an existing .env rather than overwriting it.

Alternative setup script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run.ps1
```

The process-scoped execution policy applies only to that script invocation; no permanent policy change is needed. Browser binaries are downloaded into `data/browsers` inside this project. The installer uses the Playwright version bundled with MCP, avoiding browser-version mismatches.

### Development

```powershell
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. This runs the Express API and Vite together. Keep PORT=3000 for development because the proxy points to port 3000. Production mode serves the compiled React app and API from one Express process.

## 2. Five-minute demonstration

1. Click **Scan stores now**. Six listings across three matched products appear.
2. For **Sound Mini Headphones**, save target **2000** (rupees).
3. Expand TechMart's **History & demo controls**, set demo price to **1899**, leave In stock checked, and click **Update store**.
4. Click **Scan stores now** again. The graph/history change, and both a price-drop and target-crossing alert appear.
5. Repeat the scan without changing the price: no duplicate alerts.
6. Set Auto-monitor to **Every 30 seconds**, change a demo price, and wait for the next scan. Turn monitoring off after the demo.
7. Mark alerts read. Open either demo-store link to inspect the page actually visited by the browser.
8. Expand **MCP connection proof**. Also inspect the JSONL trace:

```powershell
Get-Content .\data\mcp-trace.jsonl -Tail 12
```

The trace includes discovered tools and real `tools/call` entries for `browser_navigate` and `browser_evaluate`. No direct HTTP scrape or ordinary standalone Playwright collector substitutes for MCP.

**Reset demo prices** changes store prices only. It preserves history and alerts. Scanning records the restored prices.

## 3. Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit
# Or run all tests and the build:
npm.cmd run check
```

- Unit/API tests use an explicitly injected fake browser to isolate validation, alerts, persistence and error handling.
- The separate E2E test launches actual MCP server processes and real Chromium browsers.
- E2E checks six extracted listings, price changes, SQLite observations, alerts, and the React dashboard.
- E2E outputs are in `test-results/`; they do not alter the application database.
- See `docs/VERIFICATION.md` for the verification performed during delivery.

## 4. Optional local AI

Install Ollama separately from its official Windows distribution. In PowerShell:

```powershell
ollama pull qwen2.5:3b
```

Ollama normally starts its service automatically; otherwise run `ollama serve` in another terminal. Edit `.env`:

```dotenv
AI_ENABLED=true
OLLAMA_MODEL=qwen2.5:3b
```

Restart the app. Try:
- “Compare the headphones across stores.”
- “Scan all stores now.”
- “Set a 2000 rupee target for headphones.”

The AI returns a constrained JSON plan; the server validates it and runs one of three known actions. It cannot supply executable code, shell commands, arbitrary URLs, or new tool names. Price comparisons return actual stored values (API money values are in paise), not model-generated prices. The current plan is shown in the dashboard.

This is a **bounded natural-language agent**, not an unrestricted autonomous shopper. It supports one action per request and has no conversational memory. Model quality depends on the installed model; a model request times out after 60 seconds. AI is optional and disabled by default. Mocked AI contract tests are separate from live model verification.

## 5. Files to study

| File | Responsibility |
|---|---|
| server/mcp.js | Correct SDK imports, stdio transport, discovery, MCP calls, extraction validation |
| server/monitor.js | Scan orchestration, retries, concurrency lock, schedule |
| server/db.js | Schema, transactions, price history and alert rules |
| server/app.js | Express API, input validation, bounded AI dispatch |
| server/stores.js | Local shopping pages |
| server/catalog.js | Three canonical products and two store listings each |
| server/agent.js | Optional Ollama JSON planning |
| src/main.jsx | React dashboard, forms, graphs and polling |
| src/style.css | Responsive dashboard styling |
| tests/ | Unit, API and real MCP end-to-end tests |
| scripts/ | Windows setup/run and matching Chromium installation |
| docs/ARCHITECTURE.md | Architecture, schema and design decisions |
| docs/VIVA.md | Study priorities, questions and demo narration |
| docs/API.md | Endpoint reference |

## 6. SDK import correction

This project pins **@modelcontextprotocol/sdk 1.32.2** and uses ESM (`"type": "module"`):

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
```

Do not import Client from the package root, guess a `MCPClient` class, omit required export paths, or mix v2 package imports with this v1 dependency. The client calls `connect(transport)`, `listTools()`, and `callTool({name, arguments})`. Closing the client shuts down its transport.

On Windows, we spawn `process.execPath` with the installed MCP `cli.js` path. This avoids `npx.cmd` shell/quoting problems. The server is a child process started lazily on the first scan; you do not need to start it manually.

The old conversation's assistant code was unavailable in the retrieved preview, so this is a verified replacement rather than a line-by-line patch of unseen Day 1 code.

## 7. Scope and limitations

- Supported stores are the two included local demo stores. There is no Amazon/Flipkart adapter or CAPTCHA bypass.
- Matching is by curated canonical SKU, not fuzzy title similarity. Currency is INR; prices are integer paise. No currency conversion, shipping or tax normalization.
- In-app alerts persist in SQLite. Email, SMS and operating-system notifications are not implemented.
- Schedules run only while the Node process is running; missed scans are not replayed after shutdown. The saved interval is restored on restart and takes precedence over MONITOR_SECONDS.
- History stores every successful scan, including unchanged prices; the dashboard shows the latest 60 per listing, latest 100 alerts, and latest 20 runs.
- Targets trigger on a future crossing from above to at/below, first qualifying observation, or restock below target. Editing a target while already below it does not generate a retroactive alert.
- If a listing fails twice, the scan continues and reports partial/failed status. Earlier successful data remains visible with its observation timestamp; it is not guaranteed current.
- Local single-user project, bound to 127.0.0.1, with host/origin checks and input validation. No user accounts, remote deployment or production multi-user security.
- No retention/rotation job is included. SQLite history and MCP traces grow until manually archived.
- Node's built-in SQLite avoids native npm compilation; its stability designation depends on the installed Node 24 release.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| npm.ps1 cannot be loaded | Use npm.cmd as shown |
| Cannot find node:sqlite | Install Node 24+, reopen VS Code terminal |
| Browser executable missing | Run npm.cmd run browser:install from project root |
| Browser closes during launch on a restricted host | See the explicit MCP_NO_SANDBOX compatibility option in docs/VERIFICATION.md; leave it off for normal use |
| MCP scan fails | Read Activity errors and data/mcp-trace.jsonl; verify Chromium installed |
| Blank/dashboard setup message | Run npm.cmd run build, then refresh |
| EADDRINUSE | Stop the other process using port 3000, or set PORT=3001 in .env for production and use that URL |
| AI disabled/offline | Set AI_ENABLED=true, pull the configured model and start Ollama; restart app |
| Scan already running | Wait for current run; overlapping scans are rejected |
| No alerts on first scan | First scan is a baseline unless a target already qualifies |
| Dependencies differ | Use npm.cmd ci with the included package-lock.json |

## Sources

- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [MCP TypeScript SDK v1 client documentation](https://ts.sdk.modelcontextprotocol.io/client)
- [Ollama chat API](https://docs.ollama.com/api/chat)

The included lockfile records the exact dependency tree used during verification.
