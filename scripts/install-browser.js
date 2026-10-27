import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const cli=join(dirname(require.resolve('playwright/package.json')),'cli.js');
const result=spawnSync(process.execPath,[cli,'install','chromium'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:resolve('data/browsers')}});
process.exit(result.status ?? 1);
