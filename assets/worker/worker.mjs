import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {config,runtime,endpoint,queueURL,jobLabel,assertAuthorized} from './config.mjs';
import {Journal,atomicJSON} from './journal.mjs';
import {decidePair,pairKey,assertPortal,RETRY_DELAYS} from './policy.mjs';
import {readPair,peekPair,queueCount,selectValues,waitForAdvance,pause} from './hubspot-ui.mjs';
import {newPass,assessPass,stableEmptyEvidence} from './coverage.mjs';
import {writeReport} from './report.mjs';

process.umask(0o077);
const pilotArg=process.argv.find(a=>a.startsWith('--pilot='));
const pilotLimit=pilotArg?Number(pilotArg.split('=')[1]):Infinity;
const pilotObject=process.argv.find(a=>a.startsWith('--object='))?.split('=')[1];
if(pilotObject&&(!pilotArg||!['companies','contacts'].includes(pilotObject)))throw Error('--object is only supported for a companies/contacts pilot');
if(pilotArg&&(!Number.isInteger(pilotLimit)||pilotLimit<1||pilotLimit>10))throw Error('Pilot must contain 1–10 reviewed pairs');
assertAuthorized({pilot:!!pilotArg});
const journal=new Journal(runtime),state=journal.state;
const lock=path.join(runtime,'worker.lock');
if(fs.existsSync(lock)){
 const pid=Number(fs.readFileSync(lock,'utf8'));
 let alive=false;try{process.kill(pid,0);alive=true;}catch{}
 if(alive)throw Error('Another worker owns this client checkpoint');
 fs.unlinkSync(lock);
}
fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});
let browser,page,stopping=false,processed=0,failures=0,restarts=0;
const pilotSeen=new Set();
state.phaseResults??={};state.passAssessment??={};
if(pilotObject){state.phase=pilotObject;state.pass=null;state.passAssessment={};journal.save();}
const stopped=()=>stopping||fs.existsSync(path.join(runtime,'STOP'));
const beat=()=>atomicJSON(path.join(runtime,'worker-heartbeat.json'),{pid:process.pid,at:new Date().toISOString(),status:state.status});
function status(value,error){
 state.status=value;state.lastError=error?String(error.message||error).slice(0,500):null;journal.save();beat();
 writeReport(runtime,state,config.accountLabel);
}
function terminal(value,reason){
 state.pauseReason=reason;status(value);atomicJSON(path.join(runtime,'TERMINAL.json'),{status:value,at:state.updatedAt,reason});
 if(value==='complete_zero')fs.writeFileSync(path.join(runtime,'DONE'),'Both configured queues verified zero\n',{mode:0o600});
}
async function sleep(ms){for(let n=0;n<ms&&!stopped();n+=1000){beat();await pause(Math.min(1000,ms-n));}}
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
async function connect(){
 browser=await chromium.connectOverCDP(endpoint,{timeout:20000});
 const context=browser.contexts()[0];
 page=context.pages().find(p=>p.url().startsWith(config.hubspotOrigin+'/'))||context.pages()[0]||await context.newPage();
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(30000);
}
async function ensureQueue(){
 if(!browser?.isConnected()||!page||page.isClosed())await connect();
 if(page.url()==='about:blank')await page.goto(queueURL(state.phase),{waitUntil:'domcontentloaded'});
 const u=new URL(page.url());
 if(/login|otp|two-factor|verify|authentication|signin|choose-account/i.test(u.pathname)||u.origin!==config.hubspotOrigin){
  status('waiting_for_authentication');await sleep(10000);return false;
 }
 // Refuse a different portal even when the profile was switched manually.
 if(/^\/(duplicates|contacts)\/\d+/.test(u.pathname))assertPortal(page.url());
 if(!u.pathname.startsWith(`/duplicates/${config.portalId}/${state.phase}`))await page.goto(queueURL(state.phase),{waitUntil:'domcontentloaded'});
 assertPortal(page.url());
 const tab=page.getByRole('link',{name:state.phase==='companies'?/^Companies \([\d,]+\)$/:/^Contacts \([\d,]+\)$/});
 if(await tab.getAttribute('data-tab-selected')!=='true')await tab.click();
 const search=page.getByPlaceholder('Search for duplicates',{exact:true});
 if(await search.count()&&await search.inputValue())throw Object.assign(Error('Remove the search filter before continuing'),{code:'SCOPE_MISMATCH'});
 for(const object of ['companies','contacts']){
  state.remaining[object]=await queueCount(page,object);
  state.initial[object]??=state.remaining[object];
 }
 status('running');return true;
}
async function stableZero(object){
 // A fresh page, selected tab, affirmative empty message and four samples are required.
 await page.goto(queueURL(object),{waitUntil:'domcontentloaded'});
 const samples=[];
 for(let i=0;i<4;i++){
  const tab=page.getByRole('link',{name:object==='companies'?/^Companies \([\d,]+\)$/:/^Contacts \([\d,]+\)$/});
  if(await tab.getAttribute('data-tab-selected')!=='true')await tab.click();
  const sample={count:await queueCount(page,object),reviewRows:await page.getByRole('button',{name:'Review',exact:true}).count(),
   active:await tab.getAttribute('data-tab-selected')==='true',
   emptyVisible:await page.getByText(new RegExp(config.emptyStatePattern,'i')).first().isVisible(),
   loading:await page.locator('[aria-busy="true"]:visible,[data-loading="true"]:visible').count()>0};
  samples.push(sample);
  if(sample.count!==0||sample.reviewRows>0)return false;
  if(i<3)await sleep(2500);
 }
 return stableEmptyEvidence(samples);
}
async function closeDialog(){
 const dialog=page.getByRole('dialog');
 if(await dialog.count())await dialog.getByRole('button',{name:'Close',exact:true}).click();
}
async function nextPage(){
 await closeDialog();
 const next=page.getByRole('button',{name:'Next page',exact:true});
 await next.waitFor({timeout:10000});
 if(!await next.isEnabled())return false;
 await next.click();await pause(1000);
 state.pass.pageSeen=[];state.pass.pages++;journal.save();return true;
}
async function newPageOnePass(){
 await page.goto(queueURL(state.phase),{waitUntil:'domcontentloaded'});
 await ensureQueue();
 state.pass=newPass(state.phase,state.remaining[state.phase]);journal.save();
}
async function finishPass(){
 const object=state.phase;
 const count=await queueCount(page,object);state.remaining[object]=count;
 if(count===0){
  if(!await stableZero(object)){
   state.zeroVerificationFailures=(state.zeroVerificationFailures||0)+1;
   if(state.zeroVerificationFailures>=3){terminal('needs_configuration','Zero could not be verified against the loaded empty-state UI.');return true;}
   await newPageOnePass();return false;
  }
  state.zeroVerificationFailures=0;
  state.phaseResults[object]={status:'zero',count:0,at:new Date().toISOString(),remainingPairs:{}};
 }else{
  const assessment=assessPass(state.pass,count,state.passAssessment[object]);
  const previous=state.passAssessment[object];
  assessment.incompletePasses=assessment.status==='incomplete'?(previous?.incompletePasses||0)+1:0;
  state.passAssessment[object]=assessment;journal.save();
  if(assessment.status!=='covered'){
   if(assessment.incompletePasses>=3){terminal('needs_ui_review','Three passes could not establish coverage of the live queue. No completion claim.');return true;}
   await newPageOnePass();return false;
  }
  state.phaseResults[object]={status:'exceptions',count,at:new Date().toISOString(),remainingPairs:state.pass.seen};
 }
 state.pass=null;journal.save();
 if(pilotArg){status('pilot_ready_for_inspection');return true;}
 if(object==='companies'){
  if(count>0&&!config.contactsAfterCompanyExceptions){terminal('reviewed_with_exceptions','Company queue reviewed; unresolved pairs exported.');return true;}
  state.phase='contacts';await newPageOnePass();return false;
 }
 // Revisit companies if another scan or action changed their queue during contacts.
 const companies=await queueCount(page,'companies');state.remaining.companies=companies;
 if(!state.phaseResults.companies||companies!==state.phaseResults.companies.count){state.phase='companies';await newPageOnePass();return false;}
 if(companies===0&&count===0){
  if(!await stableZero('companies')||!await stableZero('contacts')){state.phase='companies';await newPageOnePass();return false;}
  terminal('complete_zero','Both configured queues independently refreshed and verified empty.');
 }else {
  const exceptions=Object.values(state.phaseResults).flatMap(result=>Object.values(result.remainingPairs||{}));
  const unreadable=exceptions.some(entry=>!['sequence','campaign'].includes(entry.kind));
  terminal(unreadable?'needs_ui_review':'reviewed_with_exceptions',
   unreadable?'Remaining pairs include UI or unconfirmed-outcome exceptions; inspect remaining-pairs.csv.':
    'All remaining pairs covered by two matching passes; see remaining-pairs.csv. No forced merges or unenrollment.');
 }
 return true;
}
async function recover(error){
 if(['PORTAL_MISMATCH','SCOPE_MISMATCH'].includes(error.code)){terminal('needs_configuration',error.message);return false;}
 status('recovering',error);journal.event({event:'recovery',attempt:failures+1,error:String(error.message).slice(0,500)});
 await sleep(RETRY_DELAYS[Math.min(failures,2)]);failures++;
 if(stopped())return false;
 if(failures<=3){
  if(page&&!page.isClosed())await page.reload({waitUntil:'domcontentloaded'});else await connect();
 }else{
  if(++restarts>3){terminal('needs_ui_review','Repeated browser recovery failed: '+error.message);return false;}
  // Disconnect CDP first, then restart only the dedicated browser service.
  await browser?.close().catch(()=>{});browser=null;
  execFileSync('/bin/launchctl',['kickstart','-k',`gui/${process.getuid()}/${jobLabel('browser')}`],{timeout:15000});
  failures=0;await sleep(30000);
 }
 return true;
}
try{
 if(fs.existsSync(path.join(runtime,'TERMINAL.json')))throw Error('Run control.py resume to start a new verification pass');
 // An interrupted mutation is quarantined, never blindly replayed.
 if(state.pending)journal.finish({verified:false,recovered:true});
 while(!stopped()){
  try{
   if(!await ensureQueue())continue;
   if(!state.pass)state.pass=newPass(state.phase,state.remaining[state.phase]);
   if(state.remaining[state.phase]===0){if(await finishPass())break;continue;}
   if(!await page.getByRole('dialog').count()){
    const review=page.getByRole('button',{name:'Review',exact:true}).first();
    await review.waitFor({timeout:15000});await review.click();
   }
   const reference=await peekPair(page,state.phase),key=pairKey(reference);
   if(state.pass.pageSeen.includes(key)){
    if(await nextPage())continue;
    if(await finishPass())break;continue;
   }
   let pair;
   try{pair=await readPair(page,state.phase);}
   catch(error){
    if(error.code==='PORTAL_MISMATCH')throw error;
    if(journal.noteFailure(key,error.message,reference)<4)throw error;
    pair=reference;
   }
   const unresolved=state.exceptions[key]?.unconfirmed;
   const knownBlock=state.exceptions[key]?.knownBlock;
   let decision=pair.unreadable?{action:'defer',reason:'Comparison unreadable after three retries',blockKind:'ui'}:
    knownBlock?{action:'defer',reason:state.exceptions[key].reason,blockKind:state.exceptions[key].blockKind}:
    unresolved?{action:'defer',reason:'Unconfirmed action outcome requires reconciliation',blockKind:'unconfirmed'}:decidePair(pair);
   if(decision.action==='merge'){
    try{
     pair=await selectValues(page,pair,decision);
     if(pair.mergeBlocked)decision=decidePair(pair);
    }catch(error){
     if(error.code!=='VALUE_UNAVAILABLE')throw error;
     decision={action:'defer',reason:error.message,blockKind:'property_selection'};
    }
   }
   const fresh=await peekPair(page,state.phase);
   if(pairKey(fresh)!==key)throw Error('Pair changed before action');
   if(stopped())break;
   const intent={key,action:decision.action,reason:decision.reason,blockKind:decision.blockKind,queue:pair.queue,
    primary:decision.primary===undefined?null:pair.records[decision.primary].id,pair};
   journal.begin(intent);beat();assertPortal(page.url());
   const name=decision.action==='merge'?'Merge and review next':decision.action==='reject'?'Reject and review next':'Review next';
   await page.getByRole('dialog').getByRole('button',{name,exact:true}).click({timeout:15000});
   const outcome=await waitForAdvance(page,pair,decision.action);
   if(decision.action==='defer'&&outcome.reviewed&&!outcome.verified){
    // A one-pair queue cannot visibly advance; record the reviewed blocker without inventing a skip success.
    state.pending=null;state.exceptions[key]={...state.exceptions[key],reason:decision.reason,pair,blockKind:decision.blockKind};
    journal.save();journal.event({event:'last_pair_reviewed',key,action:'defer',queue:outcome.queue});
   }else journal.finish(outcome);
   state.pass.pageSeen.push(key);
   if(decision.action==='defer')state.pass.seen[key]={kind:decision.blockKind||'unavailable',reason:decision.reason,pair,at:new Date().toISOString()};
   else {state.pass.resolved++;delete state.pass.seen[key];}
   pilotSeen.add(key);processed=pilotArg?pilotSeen.size:processed+1;failures=0;restarts=0;status('running');
   if(processed>=pilotLimit){status('pilot_ready_for_inspection');break;}
  }catch(error){
   if(stopped())break;
   if(state.pending){
    const intent=state.pending;
    if(['SEQUENCE_BLOCKED','CAMPAIGN_BLOCKED'].includes(error.code)){
     journal.finish({verified:false});
     state.exceptions[intent.key]={...state.exceptions[intent.key],reason:error.message,knownBlock:true,unconfirmed:false,
      blockKind:error.code==='CAMPAIGN_BLOCKED'?'campaign':'sequence',pair:intent.pair};
     journal.save();
    }else journal.finish({verified:false});
   }
   try{if(!await recover(error))break;}catch(recoveryError){
    status('recovering_connection',recoveryError);await sleep(30000);
    if(++restarts>3){terminal('needs_ui_review','Connection recovery exhausted; checkpoint retained.');break;}
    browser=null;
   }
  }
 }
 if(stopped())status('stopped');
}finally{
 await browser?.close().catch(()=>{});
 if(fs.existsSync(lock)&&fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);
}
