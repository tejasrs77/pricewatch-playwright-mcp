# Viva study guide

## Study in this order

1. **JavaScript essentials:** ESM imports, async/await, promises, try/finally, objects and arrays. Trace one scan from the button to SQLite.
2. **MCP:** host/client/server roles, JSON-RPC, stdio transport, initialization, tool discovery, callTool and cleanup. Know the exact imports in server/mcp.js.
3. **Playwright and DOM:** browser navigation, selectors, data attributes, browser_evaluate, structured extraction and failure modes.
4. **Express:** routes, JSON request/response, status codes, validation and middleware.
5. **SQLite:** primary/foreign keys, prepared statements, transactions, indexes and history queries.
6. **Monitoring:** scheduling, process lifetime, concurrency lock, retries, partial failures and stale observations.
7. **React:** state, effects, polling, form submission, conditional rendering and graph scaling.
8. **AI:** language-to-JSON planning, schema validation, deterministic action dispatch, hallucination limits and prompt-injection boundaries.
9. **Testing:** unit versus API versus real end-to-end tests, injection of fakes and reproducible dependency installation.

## Questions and answers

**What problem does this solve?**
It collects comparable product prices across supported stores, preserves observations over time, and tells the user about drops and target-price crossings.

**Where is MCP actually used?**
server/mcp.js creates an SDK Client, starts @playwright/mcp via StdioClientTransport, discovers tools and calls browser_navigate/browser_evaluate. Show data/mcp-trace.jsonl.

**Is this just a Playwright script?**
No. The collector communicates through MCP JSON-RPC with a separate Microsoft MCP server process. That server operates Playwright internally. The project has no direct Playwright collector.

**Is MCP artificial intelligence?**
No. MCP is a protocol for exposing tools and context. It works with deterministic programs and AI agents. Optional Ollama interprets natural language, while collection and alert rules remain deterministic.

**What is the host versus the client?**
The Node application is the host/orchestrator. Its MCP Client owns the connection to the Playwright MCP server, which exposes browser tools.

**Why stdio rather than HTTP MCP?**
This is a local child process. Stdio avoids another listening port and makes lifecycle management straightforward. It uses standard input/output for JSON-RPC, not printed human text.

**What import bug should I avoid?**
For the pinned v1 SDK, import Client from @modelcontextprotocol/sdk/client/index.js and StdioClientTransport from @modelcontextprotocol/sdk/client/stdio.js. Do not mix package versions and import conventions.

**How do you know two listings match?**
The seed catalog maps the same canonical SKU and variant across the stores. This project does not claim automatic AI matching of arbitrary products.

**Why keep prices as integers?**
Money comparisons should not rely on binary floating-point decimals. Store paise as integers and divide by 100 only for rupee display.

**Why SQLite?**
It is portable, transactional and sufficient for a single-user mini-project. Node 24 includes SQLite access, avoiding native npm build tools.

**Why store unchanged prices?**
Each observation proves the product was checked at that time. The graph may be flat, but the monitoring audit remains complete.

**How are duplicate alerts avoided?**
Rules compare consecutive successful observations. An unchanged price creates no new drop or crossing. A unique observation/kind constraint adds a database safeguard.

**What happens if a page fails?**
Retry once with a new browser session, then record an error and continue to other listings. Keep the last successful observation and display its timestamp.

**Why not scan listings in parallel?**
A single shared page would navigate away during another extraction. This version serializes scans and rejects overlapping requests. A production design could use bounded independent sessions.

**Does monitoring work after closing the terminal?**
No. The Node process owns the timer. The configured interval persists, but the process must run. No catch-up scheduler is included.

**Can AI invent a price?**
It can misunderstand intent, but price values returned by comparisons come from SQLite. The AI is restricted to planning compare/scan/target actions, then validated.

**Can page instructions control the agent?**
Page content is only used as structured product data, not passed into an autonomous model prompt. The model cannot produce executable extraction code or arbitrary URLs.

**Why do you have mocked tests if MCP must be real?**
Mocks isolate business rules quickly. A separate E2E test proves the real client/server/browser path and catches import, launch, tool-schema and DOM-integration failures.

**What are the limitations?**
Only two local demo stores, curated products, INR, local in-app alerts, single-user use, no shipping/tax normalization, no automatic external-site matching, and AI requires a separate local model.

## Two-minute presentation

“My project monitors product prices using a real Playwright MCP server. The React dashboard sends requests to Express. A JavaScript MCP client discovers browser tools and asks the server to visit supported store pages. Extracted data is validated and stored as SQLite history. Rules detect price drops and target crossings. Scheduling automates later checks. Optional Ollama converts natural language into a small set of validated actions.”

Then demonstrate the baseline scan, ₹2000 headphone target, ₹1899 demo price, second scan, two alerts, and unchanged rescan without duplicate alerts. Show the MCP trace and tests.

## Exercises before your viva

- Change a demo product price and explain every function called during collection.
- Set an out-of-stock listing below target, scan, then restock and scan. Explain the alert.
- Temporarily break a selector and explain partial failures and timestamps.
- Locate the SQLite transaction and explain why alert creation belongs inside it.
- Explain why AI is optional, and why “MCP” alone does not imply intelligence.
- Run npm.cmd run check and describe what each test layer proves.
