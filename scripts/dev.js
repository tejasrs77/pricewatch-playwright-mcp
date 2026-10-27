import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
const children=[
 spawn(process.execPath,['--env-file-if-exists=.env','--watch','server/index.js'],{stdio:'inherit'}),
 spawn(process.execPath,[join(dirname(require.resolve('vite/package.json')),'bin/vite.js')],{stdio:'inherit'})
];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const p of children)p.kill();}
for(const p of children){p.on('error',e=>{console.error(e);stop();process.exitCode=1;});p.on('exit',code=>{stop();if(code)process.exitCode=code;});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
