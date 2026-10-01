import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const company=(id,street)=>({id,name:'Example Foods',fields:{'Company Domain Name':'example.com','LinkedIn Company Page':'','Country':'US','City':'Miami','Street Address':street,'Number of Associated Contacts':'0'}});
const contact=(id,email)=>({id,name:'Ana Rivera',fields:{Email:email,'LinkedIn URL':'','Phone Number':''}});

test('full offline worker merges, rejects, exhausts blocked queue, and resumes to verified zero',{timeout:150000},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dedupe-flow-'));
 const work=path.join(temp,'worker');
 fs.cpSync(source,work,{recursive:true,filter:p=>!['node_modules','runtime','__pycache__'].includes(path.basename(p))});
 fs.symlinkSync(path.join(source,'node_modules'),path.join(work,'node_modules'),'dir');
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(()=>resolve(n));});});
 const c=JSON.parse(fs.readFileSync(path.join(work,'test/config.json'),'utf8'));
 Object.assign(c,{cdpPort:port,validated:true,scopeVerified:true,emptyStatePattern:'^No duplicates found$'});
 c.authorization={reference:'Synthetic offline test only',merge:true,reject:true};
 fs.writeFileSync(path.join(work,'config.json'),JSON.stringify(c));
 let context;
 const queues={companies:[{records:[company('101','10 Main St'),company('102','10 Main Street')]},{records:[company('201','10 Main St'),company('202','20 Main St')]}],
  contacts:[{records:[contact('301','ana@example.com'),contact('302','ANA@example.com')]},
   {records:[contact('401','ana@one.test'),contact('402','ana@two.test')]},
   {records:[contact('501','ana@three.test'),contact('502','ana@three.test')],blocked:true},
   {records:[contact('601','ana@four.test'),contact('602','ana@four.test')],blocked:true}]};
 const cursor={companies:0,contacts:0};const actions=[];
 const snapshot=o=>({object:o,pair:queues[o][cursor[o]],counts:{companies:queues.companies.length,contacts:queues.contacts.length}});
 function html(object){
  return String.raw`<div id="hs-global-toolbar-accounts">Example Client</div><nav id="tabs"></nav><input placeholder="Search for duplicates"><main id="main"></main><div id="modal"></div><button disabled>Next page</button><div id="tip" role="tooltip" hidden>You can't merge these contacts because the contact is enrolled in a sequence.</div>
  <script>
  let state=${JSON.stringify(snapshot(object))};const esc=${escape.toString()};
  function table(){document.querySelector('#modal').innerHTML='';document.querySelector('#tip').hidden=true;render(false);}
  function render(open){
   document.querySelector('#tabs').innerHTML=['companies','contacts'].map(o=>'<a href="/duplicates/123456/'+o+'?currentPage=1" data-tab-selected="'+(o===state.object)+'">'+o[0].toUpperCase()+o.slice(1)+' ('+state.counts[o]+')</a>').join('');
   document.querySelector('#main').innerHTML=state.counts[state.object]?'<button onclick="render(true)">Review</button>':'No duplicates found';
   if(!open||!state.pair){document.querySelector('#modal').innerHTML='';return;}
   const p=state.pair,type=state.object==='companies'?'0-2':'0-1';
   const cards=p.records.map((r,i)=>'<div role="checkbox" aria-checked="'+(i===0)+'"><h5>'+esc(r.name)+'</h5><a href="/contacts/123456/record/'+type+'/'+r.id+'">View record</a><dl><dt>Create date</dt><dd>01/01/2026</dd></dl></div>').join('');
   const fields=Object.keys(p.records[0].fields).map(key=>p.records.map((r,i)=>'<div role="checkbox" aria-checked="'+(i===0)+'"><dl><dt>'+esc(key)+'</dt><dd>'+esc(r.fields[key]||'--')+'</dd></dl></div>').join('')).join('');
   document.querySelector('#modal').innerHTML='<div role="dialog">'+cards+fields+'<button aria-disabled="'+!!p.blocked+'" onmouseenter="document.querySelector(\'#tip\').hidden='+!p.blocked+'" onmouseleave="document.querySelector(\'#tip\').hidden=true" onclick="act(\'merge\')">Merge and review next</button><button onclick="act(\'reject\')">Reject and review next</button><button onclick="act(\'defer\')">Review next</button><button onclick="table()">Close</button></div>';
  }
  async function act(action){state=await (await fetch('/__fixture_action',{method:'POST',body:JSON.stringify({object:state.object,action})})).json();document.querySelector('#tip').hidden=true;render(true);}
  render(false);
  </script>`;
 }
 async function run(){
  return new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[path.join(work,'worker.mjs')],{cwd:work,env:{...process.env,HUBSPOT_DEDUPE_CONFIG:'config.json'}});
   let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Worker timed out: '+output.slice(-2000)));},65000);
   child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(output));});
  });
 }
 try{
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chrome',headless:true,args:[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1']});
  // All traffic is fulfilled locally. This test never contacts a HubSpot account.
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/__fixture_action'){
    const {object,action}=JSON.parse(route.request().postData());const pair=queues[object][cursor[object]];
    actions.push({object,action,ids:pair.records.map(r=>r.id),blocked:!!pair.blocked});
    if(action==='defer')cursor[object]=(cursor[object]+1)%queues[object].length;
    else {assert.equal(pair.blocked,undefined,'A blocked pair must never be merged/rejected');queues[object].splice(cursor[object],1);cursor[object]%=queues[object].length||1;}
    await route.fulfill({contentType:'application/json',body:JSON.stringify(snapshot(object))});return;
   }
   const m=u.pathname.match(/^\/duplicates\/123456\/(companies|contacts)$/);
   if(m){cursor[m[1]]=0;await route.fulfill({contentType:'text/html',body:html(m[1])});return;}
   await route.fulfill({status:404,body:'Only synthetic fixture URLs are allowed'});
  });
  await context.pages()[0].goto('https://app.hubspot.com/duplicates/123456/companies?currentPage=1');
  await context.pages()[0].getByRole('link',{name:'Companies (2)',exact:true}).waitFor({timeout:5000});
  await run();
  const state=JSON.parse(fs.readFileSync(path.join(work,'runtime/checkpoint.json')));
  assert.equal(state.status,'reviewed_with_exceptions');
  assert.deepEqual(state.remaining,{companies:0,contacts:2});
  assert.equal(state.counts.companies.merge,1);assert.equal(state.counts.companies.reject,1);
  assert.equal(state.counts.contacts.merge,1);assert.equal(state.counts.contacts.reject,1);
  assert.equal(Object.keys(state.phaseResults.contacts.remainingPairs).length,2);
  assert.equal(fs.existsSync(path.join(work,'runtime/DONE')),false);
  assert.equal(actions.filter(a=>a.blocked).every(a=>a.action==='defer'),true);
  assert.equal(actions.filter(a=>a.blocked).length,6); // Productive pass + two matching review-only passes.
  // External fixture state changes; resumption verifies zero instead of trusting old exceptions.
  queues.contacts=[];cursor.contacts=0;
  fs.unlinkSync(path.join(work,'runtime/TERMINAL.json'));
  Object.assign(state,{phase:'companies',pass:null,phaseResults:{},passAssessment:{}});
  fs.writeFileSync(path.join(work,'runtime/checkpoint.json'),JSON.stringify(state));
  await run();
  const final=JSON.parse(fs.readFileSync(path.join(work,'runtime/checkpoint.json')));
  assert.equal(final.status,'complete_zero');assert.deepEqual(final.remaining,{companies:0,contacts:0});
  assert.equal(fs.existsSync(path.join(work,'runtime/DONE')),true);
 }finally{await context?.close();fs.rmSync(temp,{recursive:true,force:true});}
});
