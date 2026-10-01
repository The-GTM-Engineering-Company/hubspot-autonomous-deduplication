import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
export function atomicJSON(filename,value){
 const temporary=filename+'.tmp';
 const fd=fs.openSync(temporary,'w',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(temporary,filename);
}
export class Journal {
 constructor(directory){
  this.directory=directory;fs.mkdirSync(directory,{recursive:true,mode:0o700});
  this.file=path.join(directory,'checkpoint.json');
  this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{
   version:1,portal:config.portalId,phase:'companies',status:'starting',startedAt:new Date().toISOString(),
   counts:{companies:{merge:0,reject:0,defer:0},contacts:{merge:0,reject:0,defer:0}},
   remaining:{},initial:{},exceptions:{},pending:null,completedPhases:[],phaseResults:{},pass:null,
  };
  if(this.state.version!==1||this.state.portal!==config.portalId)throw Error('Unsupported checkpoint');
 }
 save(){this.state.updatedAt=new Date().toISOString();atomicJSON(this.file,this.state);}
 event(event){
  const line={at:new Date().toISOString(),...event};
  fs.appendFileSync(path.join(this.directory,'decisions.jsonl'),JSON.stringify(line)+'\n',{mode:0o600,flush:true});
  console.log(JSON.stringify({...line,pair:undefined}));
 }
 begin(intent){
  if(this.state.pending)throw Error('Unresolved action already exists');
  this.state.pending={...intent,at:new Date().toISOString(),attempts:1};this.save();
  this.event({event:'intent',...this.state.pending});
 }
 noteFailure(key,reason,pair){
  this.state.failures??={};const attempts=(this.state.failures[key]||0)+1;this.state.failures[key]=attempts;
  if(attempts>=4)this.state.exceptions[key]={reason:'UI failed after initial attempt and three retries: '+reason,uiError:true,pair,at:new Date().toISOString()};
  this.save();return attempts;
 }
 finish(outcome){
  const intent=this.state.pending;if(!intent)throw Error('No pending action');
  const object=intent.key.split(':')[0];
  if(outcome.verified){
   this.state.counts[object][intent.action]++;
   if(intent.action==='defer'){
    this.state.exceptions[intent.key]={...this.state.exceptions[intent.key],reason:intent.reason,pair:intent.pair,at:new Date().toISOString(),...(intent.blockKind?{[`${intent.blockKind}Blocked`]:true}:{})};
   }else{
    delete this.state.exceptions[intent.key];
    if(this.state.failures)delete this.state.failures[intent.key];
   }
  }
  else this.state.exceptions[intent.key]={...this.state.exceptions[intent.key],reason:'Unconfirmed action outcome',unconfirmed:true,pair:intent.pair,at:new Date().toISOString()};
  if(Number.isInteger(outcome.queue))this.state.remaining[object]=outcome.queue;
  this.state.pending=null;this.save();
  this.event({event:outcome.verified?'verified':'unconfirmed',key:intent.key,action:intent.action,reason:intent.reason,...outcome});
 }
 skipForNow(outcome,reason,kind='sequence'){
  const intent=this.state.pending;if(!intent)throw Error('No pending action');
  const object=intent.key.split(':')[0];
  if(outcome.verified){
   this.state.counts[object].defer++;
   this.state.exceptions[intent.key]={reason,[`${kind}Blocked`]:true,pair:intent.pair,at:new Date().toISOString()};
  }else this.state.exceptions[intent.key]={...this.state.exceptions[intent.key],reason:'Unconfirmed sequence skip',pair:intent.pair,at:new Date().toISOString()};
  if(Number.isInteger(outcome.queue))this.state.remaining[object]=outcome.queue;
  this.state.pending=null;this.save();
  this.event({event:outcome.verified?'sequence_skipped':'sequence_skip_unconfirmed',key:intent.key,action:'defer',reason,...outcome});
 }
}
