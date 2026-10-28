
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { products, seedListings } from '../server/catalog.js';

const product = products[0];
const sku = product.sku;
const listingId = `bharattech:${sku}`;
const listingCount = seedListings().length;

test('API validates requests and provides monitor, history and alerts', async () => {
  const f = await fixture();

  try {
    assert.equal((await f.request('/api/health')).status, 200);

    const initial = (await f.request('/api/dashboard')).body;
    assert.equal(initial.listings.length, listingCount);

    assert.equal(
      (await f.request('/api/schedule', 'PUT', { seconds: 1 })).status,
      400
    );

    assert.equal(
      (await f.request(`/api/demo/${listingId}`, 'PUT', {
        price: -1,
        stock: true
      })).status,
      400
    );

    assert.equal(
      (await f.request('/api/targets/unknown', 'PUT', {
        price: 100
      })).status,
      404
    );

    assert.equal(
      (await f.request(
        '/api/scan',
        'POST',
        {},
        { Origin: 'https://evil.example' }
      )).status,
      403
    );

    assert.equal(
      (await f.request('/api/agent', 'POST', {
        prompt: 'scan'
      })).status,
      503
    );

    assert.equal(
      (await f.request(`/api/targets/${sku}`, 'PUT', {
        price: 200000
      })).status,
      200
    );

    const firstScan = await f.request('/api/scan', 'POST');
    assert.equal(firstScan.body.saved, listingCount);

    const firstDashboard = (await f.request('/api/dashboard')).body;

    const firstPrice = firstDashboard.listings.find(
      l => l.id === listingId
    ).latest.price;

    const lowerPrice = Math.max(1, firstPrice - 10000);

    await f.request(`/api/demo/${listingId}`, 'PUT', {
      price: lowerPrice,
      stock: true
    });

    const secondScan = await f.request('/api/scan', 'POST');
    assert.equal(secondScan.body.saved, listingCount);

    let dashboard = (await f.request('/api/dashboard')).body;

    assert.ok(
      dashboard.alerts.some(
        a => a.kind === 'drop' && a.listing_id === listingId
      )
    );

    assert.equal(
      dashboard.listings.find(l => l.id === listingId).history.length,
      2
    );

    await f.request('/api/alerts/read', 'POST');

    dashboard = (await f.request('/api/dashboard')).body;

    assert.ok(dashboard.alerts.every(a => a.seen === 1));

    await f.request(`/api/targets/${sku}`, 'DELETE');

    dashboard = (await f.request('/api/dashboard')).body;

    assert.equal(
      dashboard.listings.find(l => l.sku === sku).target,
      null
    );

    assert.equal(
      (await f.request('/api/missing')).status,
      404
    );
  } finally {
    await f.close();
  }
});

test('AI actions use application services (injected planner)', async () => {
  let plan = {
    action: 'target',
    sku,
    targetRupees: 1999
  };

  const f = await fixture({
    aiEnabled: true,
    planner: async () => plan
  });

  try {
    assert.equal(
      (await f.request('/api/agent', 'POST', {
        prompt: 'target'
      })).status,
      200
    );

    assert.equal(
      f.db.prepare('SELECT price FROM targets WHERE sku=?')
        .get(sku).price,
      199900
    );

    plan = {
      action: 'scan',
      sku: null,
      targetRupees: null
    };

    const scan = await f.request('/api/agent', 'POST', {
      prompt: 'scan'
    });

    assert.equal(scan.body.result.saved, listingCount);

    plan = {
      action: 'compare',
      sku,
      targetRupees: null
    };

    const compare = await f.request('/api/agent', 'POST', {
      prompt: 'compare'
    });

    assert.equal(compare.body.result.length, 2);
  } finally {
    await f.close();
  }
});

test('product scans and saved targets reflect qualifying in-stock observations immediately', async () => {
  const f = await fixture({aiEnabled:true, planner:async()=>({action:'scan',sku,targetRupees:null})});
  try {
    await f.request(`/api/targets/${sku}`, 'PUT', {price:100});
    let d = (await f.request('/api/dashboard')).body;
    assert.equal(d.targets[0].status, 'Monitoring');
    assert.equal((await f.request('/api/scan','POST',{sku:'unknown'})).status,400);
    assert.equal((await f.request('/api/scan','POST',{sku})).body.saved,2);
    d = (await f.request('/api/dashboard')).body;
    assert.ok(d.listings.filter(l=>l.sku!==sku).every(l=>l.latest===null));
    const price = d.listings.find(l=>l.id===listingId).latest.price;
    await f.request(`/api/targets/${sku}`, 'PUT', {price});
    d = (await f.request('/api/dashboard')).body;
    assert.equal(d.targets[0].status,'Triggered');
    const count = d.alerts.filter(a=>a.kind==='target').length;
    assert.ok(count>0);
    await f.request(`/api/targets/${sku}`, 'PUT', {price});
    assert.equal((await f.request('/api/dashboard')).body.alerts.filter(a=>a.kind==='target').length,count);
    await f.request(`/api/targets/${sku}`, 'PUT', {price:100});
    await f.request(`/api/demo/${listingId}`,'PUT',{price:100,stock:false});
    assert.equal((await f.request('/api/agent','POST',{prompt:'scan product'})).body.result.saved,2);
    assert.equal((await f.request('/api/dashboard')).body.targets[0].status,'Monitoring');
    await f.request(`/api/demo/${listingId}`,'PUT',{price:100,stock:true});
    await f.request('/api/scan','POST',{sku});
    assert.equal((await f.request('/api/dashboard')).body.targets[0].status,'Triggered');
    await f.request(`/api/targets/${sku}`,'DELETE');
    assert.equal((await f.request('/api/dashboard')).body.targets.length,0);
  } finally { await f.close(); }
});
