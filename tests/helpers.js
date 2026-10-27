import {createServer} from 'node:http';
import {once} from 'node:events';
import {openDatabase} from '../server/db.js';
import {createApp} from '../server/app.js';
import {Monitor} from '../server/monitor.js';
import {BrowserMcp} from '../server/mcp.js';
export async function fixture({real=false,aiEnabled=false,planner}={}) {
 const db=openDatabase(':memory:');let app;
 const server=createServer((req,res)=>app(req,res));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=real?new BrowserMcp({origin,logPath:'test-results/mcp-trace.jsonl'}):{
   tools:[],async close(){},async extract(path){
     const l=db.prepare('SELECT l.*,d.price,d.stock FROM listings l JOIN demo d ON l.id=d.id WHERE path=?').get(path);
     return {sku:l.sku,name:l.name,price:l.price,stock:Boolean(l.stock),currency:'INR'};
   }
 };
 const monitor=new Monitor(db,browser);
 app=createApp({db,monitor,origin,aiEnabled,planner});
 async function request(path,method='GET',body,headers={}) {
   const res=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
   return {status:res.status,body:await res.json()};
 }
 return {db,origin,browser,monitor,request,async close(){await monitor.close();await new Promise(r=>server.close(r));db.close();}};
}
