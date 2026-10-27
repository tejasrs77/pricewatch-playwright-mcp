import { Router } from 'express';
import { products, stores } from './catalog.js';
export function storeRouter(db) {
  const router=Router();
  const layout=(name,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} demo store</title><style>body{font:18px system-ui;background:#f5f6fb;color:#182330;max-width:1000px;margin:50px auto;padding:24px}nav,a{color:#2156d5}article{background:white;border:1px solid #ddd;padding:32px;border-radius:18px;margin:20px 0}strong{font-size:32px}small{display:block;color:#526278;margin:20px 0}</style><nav><a href="/">Pricewatch dashboard</a> / ${name}</nav><small>LOCAL DEMO STORE • Fictional products • INR</small>${body}</html>`;
  router.get('/:store', (req,res)=>{
    const store=stores.find(s=>s.id===req.params.store);
    if(!store) return res.sendStatus(404);
    res.send(layout(store.name,'<h1>'+store.name+'</h1>'+products.map(p=>`<article><h2>${p.icon} ${p.name}</h2><a href="/stores/${store.id}/products/${p.sku}">View product</a></article>`).join('')));
  });
  router.get('/:store/products/:sku',(req,res)=>{
    const l=db.prepare('SELECT l.*,d.price,d.stock FROM listings l JOIN demo d ON d.id=l.id WHERE l.store=? AND l.sku=?').get(req.params.store,req.params.sku);
    if(!l) return res.sendStatus(404);
    res.send(layout(l.store,`<article data-product data-sku="${l.sku}" data-currency="INR" data-stock="${Boolean(l.stock)}"><h1>${l.name}</h1><strong data-price="${l.price}">₹${(l.price/100).toFixed(2)}</strong><p>${l.stock?'In stock':'Out of stock'}</p><p>Same model and variant across both demo stores.</p></article>`));
  });
  return router;
}
