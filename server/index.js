import { openDatabase } from './db.js';
import { BrowserMcp } from './mcp.js';
import { Monitor } from './monitor.js';
import { createApp } from './app.js';
const port=Number(process.env.PORT || 3000);
if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT must be 1024–65535');
const origin='http://127.0.0.1:'+port;
const db=openDatabase();
const browser=new BrowserMcp({origin});
const monitor=new Monitor(db,browser);
const app=createApp({db,monitor,origin,aiEnabled:process.env.AI_ENABLED==='true'});
const server=app.listen(port,'127.0.0.1',()=>{
  console.log('Pricewatch: '+origin);
  const seconds=Number(db.prepare("SELECT value FROM settings WHERE key='interval'").get()?.value ?? process.env.MONITOR_SECONDS ?? 0);
  if(Number.isInteger(seconds) && (seconds===0 || seconds>=30 && seconds<=86400)) monitor.schedule(seconds);
});
server.on('error',async e=>{console.error(e.message);await monitor.close();db.close();process.exitCode=1;});
let closing=false;
async function close() {
  if(closing) return; closing=true;
  // Keep the HTTP store alive until an in-flight browser scan has completed.
  await monitor.close();
  server.close(()=>{db.close();process.exit(0);});
}
process.on('SIGINT',close);process.on('SIGTERM',close);
