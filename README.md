
# PriceWatch - AI-Enhanced E-Commerce Price Monitoring using Playwright MCP

A college mini-project that demonstrates real browser automation using Microsoft's Playwright MCP server, AI-assisted commands with Ollama, automated price monitoring, and intelligent in-app price alerts.

## Project Overview

PriceWatch monitors product prices across two simulated Indian e-commerce stores using real browser automation.

The application extracts product prices, compares listings, maintains historical observations, and notifies users when a product reaches a specified target price.

### Key Features

- 60 products across five categories
- 120 product listings across two demo stores
- Product-specific store scanning
- Automated Playwright MCP browser interaction
- Price comparison across stores
- SQLite price history
- Manual price-target alerts
- AI-assisted scanning, comparison, and alert creation
- Ollama Qwen 2.5 integration
- Automatic scheduled monitoring
- Real-time dashboard updates through polling
- Automated unit, API, and end-to-end tests

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, CSS |
| Backend | Node.js, Express |
| Browser Automation | Microsoft Playwright MCP |
| MCP Communication | Model Context Protocol SDK |
| Database | SQLite |
| AI Model | Ollama Qwen 2.5 (3B) |
| Validation | Zod |
| Testing | Node.js Test Runner, Playwright MCP |

## Architecture

```text
User
 |
 v
React Dashboard
 |
 v
Express REST API
 |
 +---- AI Assistant
 |       |
 |       +---- Direct command recognition
 |       |
 |       +---- Ollama Qwen 2.5 fallback
 |       |
 |       +---- Validated action plan
 |
 +---- Price Monitoring Service
 |       |
 |       v
 |    MCP SDK Client
 |       |
 |       v
 |    Playwright MCP Server
 |       |
 |       v
 |    Chromium Browser
 |       |
 |       v
 |    Demo Shopping Stores
 |
 +---- SQLite Database
         |
         +---- Product observations
         +---- Price history
         +---- Target prices
         +---- Alerts
```

## Product Catalog

PriceWatch supports five categories:

- Smartphones: 15
- Laptops: 15
- Audio: 10
- Wearables: 5
- Accessories: 15

Total: 60 products.

Each product has listings in two fictional stores:

1. BharatTech Demo
2. IndiaDeals Demo

Prices are simulated for educational testing and are not live Amazon or Flipkart prices.

## Windows Installation

### Requirements

- Windows 10 or 11
- Node.js 24 or newer
- npm
- Git
- VS Code
- Ollama (optional for AI functionality)

### Clone Repository

```powershell
git clone https://github.com/tejasrs77/pricewatch-playwright-mcp.git
cd pricewatch-playwright-mcp
```

### Install Dependencies

```powershell
npm.cmd ci
npm.cmd run browser:install
```

### Configure Environment

```powershell
Copy-Item .env.example .env
```

For AI functionality, configure:

```dotenv
AI_ENABLED=true
OLLAMA_MODEL=qwen2.5:3b
```

### Start Development Server

```powershell
npm.cmd run dev
```

Frontend:

http://127.0.0.1:5173/

Backend:

http://127.0.0.1:3000/

### Production Mode

```powershell
npm.cmd run build
npm.cmd start
```

Open http://127.0.0.1:3000/

## Optional AI Setup

Install Ollama from:

https://ollama.com/download/windows

Download the model:

```powershell
ollama pull qwen2.5:3b
```

Verify installation:

```powershell
ollama list
```

Restart PriceWatch after enabling AI in `.env`.

### AI Assistant Commands

Scan a specific product:

```text
Scan the ASUS Vivobook 15 across all available stores.
```

Compare prices:

```text
Compare ASUS Vivobook 15 prices across stores.
```

Create a target alert:

```text
Set a price alert for ASUS Vivobook 15 when
the price drops below Rs 40000.
```

Explicit commands use deterministic action recognition to reduce unnecessary AI inference.

Other requests can be interpreted by Ollama.

The backend validates every generated action before execution.

The supported actions are:

- scan
- compare
- target

The assistant is a bounded action planner, not an unrestricted autonomous shopping agent.

## Price Monitoring Workflow

1. User selects a product.
2. User starts a scan.
3. Backend initiates the monitoring service.
4. MCP SDK client communicates with Playwright MCP.
5. Playwright MCP controls Chromium.
6. Browser visits supported demo-store pages.
7. Product identity, price, and stock are extracted.
8. Observations are validated and saved in SQLite.
9. Target-price rules are evaluated.
10. Dashboard displays updated prices and alerts.

## Price Alerts

Users can manually or automatically create target-price alerts.

Example:

Product: ASUS Vivobook 15

Target: Rs 40000

Current observed price: Rs 44159.04

Status: Monitoring

When a qualifying new observation reaches the target, PriceWatch generates an in-app alert.

Alerts are stored in SQLite.

Email, SMS, and push notifications are not implemented.

## Automated Testing

Run all verification checks:

```powershell
npm.cmd run check
```

The verification pipeline runs:

1. Unit and API tests
2. Production build
3. Real Playwright MCP end-to-end test

Latest verified results:

- Unit/API tests: 11 passed
- Real MCP E2E tests: 1 passed
- Total tests: 12 passed
- Failures: 0
- Production build: successful

The end-to-end test verifies:

```text
Playwright MCP
     |
     v
Browser extraction
     |
     v
SQLite observations
     |
     v
Price alerts
     |
     v
React dashboard
```

## Demonstration Procedure

1. Start PriceWatch.
2. Select ASUS Vivobook 15.
3. Scan the product across both stores.
4. Compare the observed prices.
5. Save a target price.
6. Verify the target appears in Alerts.
7. Use the AI assistant to scan the same product.
8. Use the AI assistant to set a new target.
9. Inspect the MCP connection proof.
10. Run the automated tests.

To inspect MCP trace records:

```powershell
Get-Content .\data\mcp-trace.jsonl -Tail 12
```

Look for MCP tool discovery and browser tool calls.

## Important Source Files

| File | Purpose |
|---|---|
| server/catalog.js | Product catalog |
| server/mcp.js | MCP SDK client and browser operations |
| server/monitor.js | Scan orchestration |
| server/db.js | SQLite persistence and alert rules |
| server/agent.js | AI action planning |
| server/app.js | Express API and action execution |
| src/main.jsx | React dashboard |
| src/style.css | Dashboard styling |
| tests/ | Automated tests |

## Project Limitations

- Uses simulated shopping stores rather than live Amazon or Flipkart.
- Product matching relies on catalog SKUs.
- AI functionality requires Ollama.
- Scheduled scans require the application to remain running.
- Alerts are currently in-app only.
- No user authentication or cloud deployment.
- Designed as a local educational project.

## Troubleshooting

| Problem | Solution |
|---|---|
| Port 5173 already in use | Stop the previous Vite process |
| Port 3000 already in use | Stop the previous backend process |
| Ollama not recognized | Install Ollama and reopen terminal |
| AI responses slow | CPU-based inference may take longer |
| Browser missing | Run npm.cmd run browser:install |
| Scan fails | Check MCP trace and backend logs |
| AI disabled | Enable AI in .env and restart |
| Tests fail | Review the failing test output |

## Additional Documentation

- docs/ARCHITECTURE.md
- docs/API.md
- docs/VERIFICATION.md
- docs/VIVA.md

## References

- https://github.com/microsoft/playwright-mcp
- https://modelcontextprotocol.io/
- https://docs.ollama.com/

## Author

Tejas Rs

GitHub: https://github.com/tejasrs77
