import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {config,runtime,queueURL} from './config.mjs';
process.umask(0o077);
fs.mkdirSync(runtime,{recursive:true,mode:0o700});
if(fs.existsSync(path.join(runtime,'BROWSER_STOP')))process.exit(0);
const context=await chromium.launchPersistentContext(path.join(runtime,'chrome-profile'),{
 channel:'chrome',headless:false,viewport:null,chromiumSandbox:true,timeout:60000,
 args:['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${config.cdpPort}`,'--start-maximized'],
});
const page=context.pages()[0]||await context.newPage();
try{await page.goto(queueURL('companies'),{waitUntil:'domcontentloaded',timeout:60000});}
catch(error){console.error('Initial navigation failed; the worker will retry:',error.message);}
await page.bringToFront();
const heartbeat=setInterval(()=>fs.writeFileSync(path.join(runtime,'browser-heartbeat.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid})),10000);
context.on('close',()=>{clearInterval(heartbeat);process.exit(fs.existsSync(path.join(runtime,'BROWSER_STOP'))?0:1);});
async function stop(){clearInterval(heartbeat);await context.close();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
