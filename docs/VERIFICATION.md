# Verification report

Verified on Windows with Node v24.16.0 and npm 11.13.0 on 27 October 2026.

| Check | Result |
|---|---|
| npm dependency installation | Passed; package-lock.json included |
| npm ls --depth=0 | No missing or invalid top-level packages |
| npm test | 10 passed, 0 failed |
| npm run build | Passed (Vite 7.3.7) |
| npm run test:e2e | 1 passed, 0 failed; real MCP servers + Chromium |
| npm audit (including development dependencies) | 0 vulnerabilities reported |
| Desktop/mobile screenshots | Visually inspected; no horizontal overflow at 390 px |
| Optional AI contract/dispatch tests | Passed with injected responses |
| Live Ollama inference | Not tested: Ollama/model not installed in this environment |

## Dependency versions

- @modelcontextprotocol/sdk 1.32.2
- @playwright/mcp 0.0.83
- Express 5.3.0
- React / React DOM 19.3.1
- Zod 4.6.7
- Vite 7.3.7
- MCP's bundled Playwright 1.64.0-alpha-1790635538000
- Matching Chromium build 1247

The MCP package itself currently pins an alpha Playwright build. The lockfile and installer retain the exact matching version instead of mixing it with another browser installation.

## Real E2E evidence

The test:
1. Started Express on an ephemeral loopback port with an isolated SQLite database.
2. Started Microsoft's MCP server through the v1 SDK stdio transport.
3. Discovered browser tools and extracted six live HTML product pages.
4. Changed the TechMart headphone price from ₹2499 to ₹1899.
5. Verified persisted observations and two alerts (drop + ₹2000 target).
6. Opened the production React dashboard in a second isolated MCP browser.
7. Verified three product groups, six graphs and two alerts.
8. Clicked the dashboard scan button through MCP and verified no repeated alerts.
9. Captured desktop/mobile screenshots and checked mobile overflow.
10. Closed browser/server processes and database.

Screenshots: [Desktop](dashboard.png), [Mobile](mobile.png).
Re-running tests produces tool-call traces in test-results/.

## Windows test-host compatibility

This restricted execution host prevented Chromium's normal child-process initialization. Verification used the explicit environment option:

```powershell
$env:MCP_NO_SANDBOX = 'true'
npm.cmd run test:e2e
Remove-Item Env:MCP_NO_SANDBOX
```

This disables Chromium's internal sandbox, not the host's restrictions. The shipped application **keeps normal Chromium sandboxing by default**. Use this compatibility option only for the included trusted local demo pages if your environment exhibits the same browser-start failure. Normal Windows VS Code execution should first use the default setup.

## Fixes verified

- Correct explicit v1 SDK imports and ESM package configuration.
- Direct Node launch of MCP cli.js, avoiding Windows .cmd spawning ambiguity.
- Proper parsing of both object and ordinary string MCP evaluation results.
- Zod updated after the initial dependency audit.
- Separate browser sessions for monitoring and UI tests.
