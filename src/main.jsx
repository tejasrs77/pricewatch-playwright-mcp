
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const money = v =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(v / 100);

const time = v => v ? new Date(v).toLocaleString('en-IN') : 'Never';

async function api(path, method = 'GET', body) {
  const response = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function Sparkline({ history = [] }) {
  if (history.length < 2) {
    return <p className="muted">Run two scans to see a trend.</p>;
  }

  const prices = history.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const points = prices.map((p, i) =>
    `${8 + i * 284 / (prices.length - 1)},${70 - (p - min) / Math.max(1, max - min) * 54}`
  ).join(' ');

  return (
    <svg
      viewBox="0 0 300 82"
      role="img"
      aria-label={`Price history from ${money(min)} to ${money(max)}`}
    >
      <line x1="8" y1="72" x2="292" y2="72" stroke="#dce5ed" />
      <polyline
        points={points}
        fill="none"
        stroke="#137c70"
        strokeWidth="3"
      />
    </svg>
  );
}

function StatCard({ value, label, description }) {
  return (
    <div>
      <b>{value}</b>
      <span>{label}</span>
      {description && (
        <small className="muted">{description}</small>
      )}
    </div>
  );
}

function Listing({ l, busy, act }) {
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState(true);

  const before = l.history.at(-2)?.price;
  const now = l.latest?.price;

  const delta = before && now
    ? (now - before) / before * 100
    : null;

  const storeName = {
    bharattech: 'BharatTech Demo',
    indiadeals: 'IndiaDeals Demo'
  }[l.store] || l.store;

  return (
    <article className="listing">
      <div className="row">
        <a href={l.path} target="_blank" rel="noreferrer">
          {storeName} ↗
        </a>

        <span className={'pill ' + (l.latest?.stock ? 'good' : '')}>
          {!l.latest
            ? 'Not scanned'
            : l.latest.stock
              ? 'In stock'
              : 'Out of stock'}
        </span>
      </div>

      <div className="price">
        {money(now)}
        <small className={delta < 0 ? 'green' : 'muted'}>
          {delta == null
            ? ''
            : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
        </small>
      </div>

      <Sparkline history={l.history} />

      <p className="muted timestamp">
        Observed: {time(l.latest?.observed_at)}
      </p>

      <details>
        <summary>History & demo controls</summary>

        <div className="history">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Price</th>
                <th>Stock</th>
              </tr>
            </thead>

            <tbody>
              {l.history.slice().reverse().map((h, i) => (
                <tr key={i}>
                  <td>{time(h.observed_at)}</td>
                  <td>{money(h.price)}</td>
                  <td>{h.stock ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={e => {
          e.preventDefault();

          act(
            () => api(
              '/demo/' + encodeURIComponent(l.id),
              'PUT',
              {
                price: Math.round(Number(price) * 100),
                stock
              }
            ),
            'Demo price updated. Run a scan to collect it.'
          );
        }}>
          <label>
            Demo price (₹)
            <input
              aria-label={'Demo price ' + l.id}
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="e.g. 1999"
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={stock}
              onChange={e => setStock(e.target.checked)}
            />
            In stock
          </label>

          <button disabled={busy}>Update store</button>
        </form>
      </details>
    </article>
  );
}

function Product({ listings, busy, act }) {
  const [target, setTarget] = useState('');
  const p = listings[0];
  useEffect(() => setTarget(p.target == null ? '' : String(p.target / 100)), [p.target]);

  const available = listings.filter(l => l.latest?.stock);

  const best = available.length
    ? Math.min(...available.map(l => l.latest.price))
    : null;

  const observedCount = listings.filter(l => l.latest).length;

  return (
    <section className="product">
      <div className="row wrap">
        <div>
          <p className="eyebrow">{p.sku}</p>
          <h2>{p.name}</h2>

          <p className="muted">
            {observedCount} of {listings.length} stores scanned
          </p>
        </div>

        <span className="pill good">
          Best observed: {money(best)}
        </span>
      </div>

      <button type="button" disabled={busy} onClick={() => act(
        () => api('/scan', 'POST', { sku: p.sku }), 'Product scan complete  -  all stores checked.'
      )}>Scan this product across stores</button>
      <div className="listing-grid">
        {listings.map(l => (
          <Listing
            key={l.id}
            l={l}
            busy={busy}
            act={act}
          />
        ))}
      </div>

      <form
        className="target"
        onSubmit={e => {
          e.preventDefault();

          act(
            () => api(
              '/targets/' + p.sku,
              'PUT',
              { price: Math.round(Number(target) * 100) }
            ),
            'Target saved'
          );
        }}
      >
        <label>
          Alert target (₹)
          <input
            aria-label={'Target ' + p.sku}
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={
              p.target
                ? String(p.target / 100)
                : 'Set target'
            }
          />
        </label>

        <button disabled={busy}>Save target</button>

        <span className="muted">
          Current: {money(p.target)}
        </span>

        {p.target && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                () => api('/targets/' + p.sku, 'DELETE'),
                'Target removed'
              )
            }
          >
            Remove
          </button>
        )}
      </form>
    </section>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [availability, setAvailability] = useState('All');
  const [sort, setSort] = useState('name');

  const refresh = async () => {
    setData(await api('/dashboard'));
  };

  useEffect(() => {
    refresh().catch(e => setError(e.message));

    const timer = setInterval(() => {
      refresh().catch(e => setError(e.message));
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  async function act(fn, message) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await fn();
      await refresh();

      setNotice(
        result?.errors?.length
          ? 'Scan completed with errors; see activity.'
          : message
      );

      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || Boolean(data?.monitor?.running);

  const listings = data?.listings || [];

  const groups = Object.groupBy(listings, l => l.sku);

  const productGroups = Object.values(groups);

  const totalProducts = productGroups.length;

  const monitoredProducts = productGroups.filter(
    group => group.some(l => l.latest != null)
  ).length;

  const monitoredListings = listings.filter(
    l => l.latest != null
  ).length;

  const totalListings = listings.length;

  const totalStores = new Set(
    listings.map(l => l.store)
  ).size;

  const unread = (data?.alerts || []).filter(
    a => !a.seen
  ).length;

  const categories = [
    'All',
    'Smartphones',
    'Laptops',
    'Audio',
    'Wearables',
    'Accessories'
  ];

  const getCategory = name => {
    const lower = name.toLowerCase();

    if (/iphone|galaxy s|galaxy a|oneplus 12|nord|redmi|realme gt|narzo|vivo|oppo|nothing phone|motorola|realme buds/.test(lower)) {
      if (lower.includes('buds')) return 'Audio';
      return 'Smartphones';
    }

    if (/vivobook|tuf|pavilion|victus|ideapad|lenovo loq|inspiron|dell g15|aspire|nitro|macbook|msi thin|galaxy book|lg gram/.test(lower)) {
      return 'Laptops';
    }

    if (/watch|colorfit|wave sigma|amazfit/.test(lower)) {
      return 'Wearables';
    }

    if (/headphone|earbud|buds|airdopes|rockerz|jbl|sony wh|sony wf|tune 770|live pro/.test(lower)) {
      return 'Audio';
    }

    return 'Accessories';
  };

  const filteredGroups = productGroups.filter(group => {
    const product = group[0];

    const matchesSearch =
      product.name.toLowerCase().includes(query.toLowerCase()) ||
      product.sku.toLowerCase().includes(query.toLowerCase());

    const matchesCategory =
      category === 'All' ||
      getCategory(product.name) === category;

    const matchesAvailability =
      availability === 'All' ||
      (
        availability === 'In stock' &&
        group.some(l => l.latest?.stock)
      ) ||
      (
        availability === 'Out of stock' &&
        group.every(l => l.latest && !l.latest.stock)
      ) ||
      (
        availability === 'Not scanned' &&
        group.every(l => !l.latest)
      );

    return matchesSearch &&
      matchesCategory &&
      matchesAvailability;
  });

  const bestPrice = group => {
    const prices = group
      .filter(l => l.latest?.stock)
      .map(l => l.latest.price);

    return prices.length
      ? Math.min(...prices)
      : Infinity;
  };

  filteredGroups.sort((a, b) => {
    if (bestPrice(a) === Infinity && bestPrice(b) !== Infinity) return 1;
    if (bestPrice(b) === Infinity && bestPrice(a) !== Infinity) return -1;
    if (sort === 'price-low') {
      return bestPrice(a) - bestPrice(b);
    }

    if (sort === 'price-high') {
      return bestPrice(b) - bestPrice(a);
    }

    return a[0].name.localeCompare(b[0].name);
  });

  const scanProgress = totalListings
    ? Math.round(monitoredListings / totalListings * 100)
    : 0;

  return (
    <>
      <header>
        <div className="brand">
          ◈ PRICEWATCH <span>MCP LAB</span>
        </div>

        <span className="pill good">
          {data?.monitor?.running
            ? 'Scanning…'
            : 'Local workspace'}
        </span>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">
            E-COMMERCE INTELLIGENCE / MINI PROJECT
          </p>

          <h1>
            Watch prices.
            <br />
            <em>Catch the right moment.</em>
          </h1>

          <p>
            Compare products across demo stores, monitor price
            changes, and receive alerts using Playwright MCP.
          </p>

          <div className="actions">
            <button
              className="primary"
              disabled={locked}
              onClick={() =>
                act(
                  () => api('/scan', 'POST'),
                  'Scan complete — prices collected through Playwright MCP.'
                )
              }
            >
              {locked ? 'Working…' : 'Scan stores now'}
            </button>

            <label>
              Auto-monitor
              <select
                aria-label="Monitoring interval"
                disabled={busy}
                value={data?.monitor?.seconds || 0}
                onChange={e =>
                  act(
                    () => api(
                      '/schedule',
                      'PUT',
                      { seconds: Number(e.target.value) }
                    ),
                    'Schedule updated'
                  )
                }
              >
                <option value="0">Off</option>
                <option value="30">Every 30 seconds</option>
                <option value="60">Every minute</option>
                <option value="300">Every 5 minutes</option>
                {data?.monitor?.seconds &&
                  ![30, 60, 300].includes(data.monitor.seconds) && (
                    <option value={data.monitor.seconds}>
                      Every {data.monitor.seconds}s
                    </option>
                  )}
              </select>
            </label>
          </div>
        </section>

        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}

        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}

        <div className="stats">
          <StatCard
            value={totalProducts}
            label="Total products"
            description="Unique catalog items"
          />

          <StatCard
            value={monitoredProducts}
            label="Monitored products"
            description="At least one successful observation"
          />

          <StatCard
            value={totalListings}
            label="Store listings"
            description="Products across all stores"
          />

          <StatCard
            value={totalStores}
            label="Demo stores"
            description="Currently configured"
          />

          <StatCard
            value={data?.runs?.length || 0}
            label="Recent scans"
            description="Latest 20 scan records"
          />

          <StatCard
            value={unread}
            label="Unread alerts"
            description="Latest 100 alerts"
          />
        </div>

        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="row wrap">
            <div>
              <h2>Monitoring overview</h2>
              <p className="muted">
                {monitoredListings} of {totalListings} store listings
                have been scanned at least once.
              </p>
            </div>

            <span className="pill good">
              {scanProgress}% observed
            </span>
          </div>

          <progress
            value={monitoredListings}
            max={Math.max(1, totalListings)}
            style={{ width: '100%', height: 12 }}
          />
        </section>

        <div className="content">
          <div>
            <div className="row wrap">
              <h2>Product watchlist</h2>

              <input
                aria-label="Filter products"
                placeholder="Search products…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <div
              className="row wrap"
              style={{ marginBottom: 20, gap: 12 }}
            >
              <label>
                Category
                <select
                  aria-label="Product category"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Availability
                <select
                  aria-label="Product availability"
                  value={availability}
                  onChange={e => setAvailability(e.target.value)}
                >
                  <option>All</option>
                  <option>In stock</option>
                  <option>Out of stock</option>
                  <option>Not scanned</option>
                </select>
              </label>

              <label>
                Sort by
                <select
                  aria-label="Sort products"
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                >
                  <option value="name">Product name</option>
                  <option value="price-low">Lowest price</option>
                  <option value="price-high">Highest price</option>
                </select>
              </label>
            </div>

            <p className="muted">
              Showing {filteredGroups.length} of {totalProducts} products
            </p>

            {!data && <p>Loading dashboard…</p>}

            {data && filteredGroups.length === 0 && (
              <section className="panel">
                No products match your filters.
              </section>
            )}

            {filteredGroups.map(group => (
              <Product
                key={group[0].sku}
                listings={group}
                busy={locked}
                act={act}
              />
            ))}
          </div>

          <aside>
            <section className="panel">
              <div className="row">
                <h2>Alerts</h2>

                <button
                  disabled={busy || !unread}
                  onClick={() =>
                    act(
                      () => api('/alerts/read', 'POST'),
                      'Alerts marked read'
                    )
                  }
                >
                  Mark read
                </button>
              </div>

              <p className="muted">
                Saved targets appear immediately. Status uses the latest in-stock prices; scan to refresh.
              </p>

              {data?.targets?.map(t => (
                <div className="alert target-status" key={t.sku}>
                  <b>{t.name}</b>
                  <p>Target: {money(t.price)}  -  Best observed: {money(t.bestPrice)}</p>
                  <span className={'pill ' + (t.status === 'Triggered' ? 'good' : '')}>{t.status}</span>
                </div>
              ))}
              {!data?.alerts?.length && !data?.targets?.length && (
                <p>
                  No alerts yet. Change a demo price,
                  then scan again.
                </p>
              )}

              {data?.alerts?.slice(0, 15).map(a => (
                <div
                  className={'alert ' + (a.seen ? 'seen' : '')}
                  key={a.id}
                >
                  <b>
                    {a.kind === 'drop'
                      ? '↘ Price drop'
                      : '◎ Target reached'}
                  </b>

                  <p>{a.message}</p>
                  <small>{time(a.created_at)}</small>
                </div>
              ))}
            </section>

            <section className="panel">
              <h2>
                AI assistant{' '}
                <span className="pill">
                  {data?.aiEnabled
                    ? 'Ollama enabled'
                    : 'Optional'}
                </span>
              </h2>

              <p className="muted">
                Ask to compare products, scan stores,
                or set a target. Requires local Ollama.
              </p>

              {data && !data.aiEnabled && <p>AI is disabled. Set AI_ENABLED=true in .env, start Ollama, and restart PriceWatch.</p>}
              <form
                onSubmit={async e => {
                  e.preventDefault();

                  const result = await act(
                    () => api('/agent', 'POST', { prompt }),
                    'AI request completed'
                  );

                  if (result) setAnswer(result);
                }}
              >
                <textarea
                  aria-label="AI request"
                  placeholder="Set a ₹2000 target for headphones"
                  maxLength="1000"
                  required
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                />

                <button disabled={locked || !data?.aiEnabled}>
                  Ask assistant
                </button>
              </form>

              {answer && (
                <>
                  <p>
                    Action: <b>{answer.plan.action}</b>
                  </p>

                  {Array.isArray(answer.result) ? answer.result.map((r, i) => (
                    <p key={i}>{r.name}  -  {r.store}: {money(r.price)}  -  {r.stock == null ? 'Not scanned' : r.stock ? 'In stock' : 'Out of stock'}</p>
                  )) : <p>{answer.result.message || `${answer.result.saved} store listings scanned; ${answer.result.errors?.length || 0} errors.`}</p>}
                </>
              )}
            </section>

            <section className="panel">
              <h2>Activity</h2>

              {data?.runs?.slice(0, 8).map(r => (
                <div className="run" key={r.id}>
                  <b>#{r.id} · {r.status}</b>
                  <small>{time(r.started)}</small>

                  {r.errors.map((e, i) => (
                    <p className="error" key={i}>
                      {e.listing}: {e.message}
                    </p>
                  ))}
                </div>
              ))}

              <details>
                <summary>MCP connection proof</summary>

                <p>
                  Discovered tools: {data?.mcpTools?.length || 0}
                </p>

                <code>
                  {data?.mcpTools?.join(', ') ||
                    'Run a scan to connect.'}
                </code>

                <p>
                  Full tool-call trace: data/mcp-trace.jsonl
                </p>
              </details>
            </section>
          </aside>
        </div>

        <footer>
          PriceWatch · React + Express + SQLite + Playwright MCP ·{' '}
          <a href="/stores/bharattech" target="_blank" rel="noreferrer">
            BharatTech Demo
          </a>
          {' / '}
          <a href="/stores/indiadeals" target="_blank" rel="noreferrer">
            IndiaDeals Demo
          </a>

          <button
            disabled={locked}
            onClick={() =>
              act(
                () => api('/demo/reset', 'POST'),
                'Demo prices reset. Scan to collect new observations.'
              )
            }
          >
            Reset demo prices
          </button>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
