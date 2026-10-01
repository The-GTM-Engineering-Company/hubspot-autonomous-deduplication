import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Journal} from '../journal.mjs';
import {newPass,assessPass,stableEmptyEvidence} from '../coverage.mjs';
import {decidePair} from '../policy.mjs';
import {validateConfig,config,assertAuthorized} from '../config.mjs';
import {csvCell} from '../report.mjs';

const person=(fields={},other=fields)=>({object:'contacts',records:[{id:'101',name:'Ana Rivera',fields},{id:'202',name:'Ana Rivera',fields:other}]});
const blockedPass=()=>{
 const p=newPass('contacts',2);
 p.seen={'contacts:101:202':{kind:'sequence',reason:'Currently in a sequence'},'contacts:303:404':{kind:'campaign',reason:'Active campaign'}};
 return p;
};
test('one repeated pair does not prove coverage of a larger queue',()=>{
 const p=blockedPass();p.startCount=100;
 assert.equal(assessPass(p,100).status,'incomplete');
});
test('two full matching nonproductive passes terminate with covered exceptions',()=>{
 const first=assessPass(blockedPass(),2);
 assert.equal(first.status,'candidate');
 assert.equal(assessPass(blockedPass(),2,first).status,'covered');
});
test('changed reason requires another full pass even when count and IDs match',()=>{
 const p=blockedPass(),first=assessPass(p,2);
 p.seen['contacts:101:202'].reason='Unexplained disabled button';
 assert.equal(assessPass(p,2,first).status,'candidate');
});
test('queue growth and successful mutations cannot be called all blocked',()=>{
 const p=blockedPass(),first=assessPass(p,2);
 assert.equal(assessPass(p,3,first).status,'progress');
 p.resolved=1;assert.equal(assessPass(p,2,first).status,'progress');
 assert.throws(()=>assessPass(p,undefined));
});
test('new remaining IDs require a new confirmation pass',()=>{
 const p=blockedPass(),first=assessPass(p,2);
 p.seen['contacts:505:606']=p.seen['contacts:303:404'];delete p.seen['contacts:303:404'];
 assert.equal(assessPass(p,2,first).status,'candidate');
});
test('placeholder zeros, inactive tabs and missing empty state never prove zero',()=>{
 const good={count:0,reviewRows:0,active:true,emptyVisible:true,loading:false};
 assert.equal(stableEmptyEvidence(Array(4).fill(good)),true);
 for(const changed of [{active:false},{loading:true},{emptyVisible:false},{reviewRows:1},{count:undefined}]){
  assert.equal(stableEmptyEvidence([good,good,good,{...good,...changed}]),false);
 }
 assert.equal(stableEmptyEvidence([good]),false);
});
test('pending write survives restart and unknown result never increases merge count',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dedupe-journal-'));
 try{
  const a=new Journal(dir);a.begin({key:'contacts:101:202',action:'merge',reason:'Same person',pair:person()});
  const b=new Journal(dir);assert.equal(b.state.pending.key,'contacts:101:202');
  assert.throws(()=>b.begin({key:'contacts:303:404'}));
  b.finish({verified:false});
  assert.equal(b.state.counts.contacts.merge,0);
  assert.equal(b.state.exceptions['contacts:101:202'].unconfirmed,true);
  b.begin({key:'contacts:101:202',action:'defer',reason:'Keep quarantined',pair:person()});b.finish({verified:true,queue:2});
  assert.equal(b.state.exceptions['contacts:101:202'].unconfirmed,true);
  assert.equal(b.state.counts.contacts.merge,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('repeated defer preserves blocker flags; verified resolution clears outstanding exception',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dedupe-journal-'));
 try{
  const j=new Journal(dir),key='contacts:101:202';
  j.begin({key,action:'defer',blockKind:'sequence',reason:'Sequence',pair:person()});j.finish({verified:true,queue:1});
  j.begin({key,action:'defer',reason:'Still deferred',pair:person()});j.finish({verified:true,queue:1});
  assert.equal(j.state.exceptions[key].sequenceBlocked,true);
  j.begin({key,action:'merge',reason:'Block resolved',pair:person()});j.finish({verified:true,queue:0});
  assert.equal(j.state.counts.contacts.merge,1);assert.equal(j.state.exceptions[key],undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('another portal cannot load an existing journal',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dedupe-journal-'));
 try{
  fs.writeFileSync(path.join(dir,'checkpoint.json'),JSON.stringify({version:1,portal:'987654'}));
  assert.throws(()=>new Journal(dir));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('active enrollment property overrides matching personal identity',()=>{
 const p=person({Email:'ana@example.com','Currently in sequence':'Yes'});
 assert.equal(decidePair(p).action,'defer');assert.equal(decidePair(p).blockKind,'sequence');
 const inactive=person({Email:'ana@example.com','Currently in sequence':'No'});
 assert.equal(decidePair(inactive).action,'merge');
 const company={object:'companies',records:[{id:'101',name:'Example Foods',fields:{'Campaign status':'Active'}},{id:'202',name:'Example Foods',fields:{}}]};
 assert.equal(decidePair(company).action,'merge','Contact enrollment fields must not become a company matching rule');
});
test('placeholder email and non-person LinkedIn are not strong contact identity',()=>{
 assert.equal(decidePair(person({Email:'unknown@example.com'})).action,'reject');
 assert.equal(decidePair(person({'LinkedIn URL':'https://linkedin.com/company/example'})).action,'reject');
 assert.equal(decidePair(person({'LinkedIn URL':'https://linkedin.com'})).action,'reject');
});
test('unloaded name is deferred rather than rejected',()=>{
 const p=person({Email:'ana@example.com'});p.records[1].name='';
 assert.equal(decidePair(p).action,'defer');
});
test('primary does not compare open deals on one side with total deals on the other',()=>{
 const p=person({Email:'ana@example.com','Number of open deals':'1','Contact owner':'Alex'},
  {Email:'ana@example.com','Number of Associated Deals':'50'});
 assert.equal(decidePair(p).primary,0);
});
test('template is unarmed and validates client/host/port boundaries',()=>{
 assert.throws(()=>assertAuthorized());assert.throws(()=>assertAuthorized({pilot:true}));
 assert.throws(()=>validateConfig({...config,hubspotOrigin:'https://app.hubspot.com.evil.test'}));
 assert.throws(()=>validateConfig({...config,portalId:'123456/contacts'}));
 assert.throws(()=>validateConfig({...config,cdpPort:80}));
});
test('exception CSV neutralizes formulas and quotes embedded content',()=>{
 assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
 assert.equal(csvCell('Ana, Rivera'),'"Ana, Rivera"');
});
