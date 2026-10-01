import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root,runtime} from './config.mjs';
import {atomicJSON} from './journal.mjs';
process.umask(0o077);
let stopping=false,child,rapidFailures=0;
const paused=()=>stopping||['STOP','TERMINAL.json','DONE'].some(f=>fs.existsSync(path.join(runtime,f)));
const log=e=>console.log(JSON.stringify({at:new Date().toISOString(),...e}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function killChild(){child?.kill('SIGTERM');const victim=child;setTimeout(()=>{if(victim?.exitCode===null)victim.kill('SIGKILL');},8000).unref();}
process.on('SIGTERM',()=>{stopping=true;killChild();});process.on('SIGINT',()=>{stopping=true;killChild();});
while(!paused()){
 const started=Date.now();
 child=spawn(process.execPath,[path.join(root,'worker.mjs')],{cwd:root,env:process.env,stdio:'inherit'});
 log({event:'worker_started',pid:child.pid});
 let killed=false;
 const watchdog=setInterval(()=>{
  let last=started;
  try{const h=JSON.parse(fs.readFileSync(path.join(runtime,'worker-heartbeat.json'),'utf8'));if(h.pid===child.pid)last=Date.parse(h.at);}catch{}
  if(!killed&&Date.now()-last>180000){killed=true;log({event:'watchdog_restart'});killChild();}
 },5000);
 const result=await new Promise(resolve=>{child.once('error',e=>resolve({error:e.message}));child.once('exit',(code,signal)=>resolve({code,signal}));});
 clearInterval(watchdog);log({event:'worker_exit',...result});
 if(paused()||result.code===0)break;
 rapidFailures=Date.now()-started>120000?0:rapidFailures+1;
 if(rapidFailures>=9){
  atomicJSON(path.join(runtime,'TERMINAL.json'),{status:'needs_ui_review',at:new Date().toISOString(),reason:'Nine rapid process failures; inspect logs before resuming.'});break;
 }
 const delay=rapidFailures>=3?300000:[10000,30000,60000][Math.max(0,rapidFailures-1)];
 log({event:'restart_scheduled',seconds:delay/1000});
 for(let n=0;n<delay&&!paused();n+=1000)await wait(1000);
}
log({event:'supervisor_stopped'});
