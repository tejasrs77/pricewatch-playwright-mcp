# API reference

Base: http://127.0.0.1:3000. JSON bodies. Money is **integer paise** (₹1999 = 199900). Mutation requests from unrecognized browser origins are rejected. No public deployment is intended.

| Method | Path | Body / result |
|---|---|---|
| GET | /api/health | {ok:true} |
| GET | /api/dashboard | listings with latest/history/target, alerts, runs, monitor, aiEnabled, mcpTools |
| POST | /api/scan | Waits for scan; {id,saved,errors}; 409 if already running |
| PUT | /api/schedule | {seconds:0} disables; otherwise integer 30–86400 |
| PUT | /api/targets/:sku | {price:200000} |
| DELETE | /api/targets/:sku | Removes target |
| POST | /api/alerts/read | Marks all existing alerts read |
| PUT | /api/demo/:id | {price:189900,stock:true} |
| POST | /api/demo/reset | Restores demo prices and stock; keeps history |
| POST | /api/agent | {prompt:"Scan all stores"}; optional AI required |
| GET | /stores/:store | Demo storefront |
| GET | /stores/:store/products/:sku | HTML product page |

Store IDs: techmart, dealbay. SKU IDs: sound-mini, type-pro, pulse-watch.
Listing ID example: techmart:sound-mini.

## PowerShell example

```powershell
$base = 'http://127.0.0.1:3000'
Invoke-RestMethod "$base/api/scan" -Method Post
Invoke-RestMethod "$base/api/targets/sound-mini" -Method Put -ContentType 'application/json' -Body '{"price":200000}'
Invoke-RestMethod "$base/api/demo/techmart:sound-mini" -Method Put -ContentType 'application/json' -Body '{"price":189900,"stock":true}'
Invoke-RestMethod "$base/api/scan" -Method Post
(Invoke-RestMethod "$base/api/dashboard").alerts
```

Successful scan HTTP 200 can include per-listing errors; inspect saved/errors and run status. Validation errors return 400, unknown resources 404, contention 409, disabled AI 503, and other failures return an error JSON object.
