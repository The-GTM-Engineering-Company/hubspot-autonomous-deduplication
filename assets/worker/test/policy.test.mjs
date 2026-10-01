import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePair, retryRead, assertPortal, pairKey, reconcilePending } from '../policy.mjs';

const company = (a={}, b={}) => ({object:'companies',records:[{id:'101',name:'Example Foods Inc.',fields:{...a}},{id:'202',name:'Example Foods',fields:{...b}}]});
const contact = (a={}, b={}, names=['Maria Perez','Maria Perez']) => ({object:'contacts',records:[{id:'101',name:names[0],fields:a},{id:'202',name:names[1],fields:b}]});

test('same business: choose record with contact relationships before field count',()=>{
 const p=company({'Company Domain Name':'example.com','City':'Miami','Industry':'Food','Number of Associated Contacts':'0'},{'Company Domain Name':'example.com','Number of Associated Contacts':'9'});
 assert.equal(decidePair(p).action,'merge');assert.equal(decidePair(p).primary,1);
});
test('equal continuity: choose more complete record',()=>{
 const d=decidePair(company({}, {'Company Domain Name':'example.com','City':'Miami'}));
 assert.equal(d.action,'merge');assert.equal(d.primary,1);
});
test('two distinct street numbers must remain separate',()=>{
 assert.equal(decidePair(company({'Street Address':'10 Main St.'},{'Street Address':'20 Main Street'})).action,'reject');
});
test('punctuation and street abbreviations do not create false address conflicts',()=>{
 assert.equal(decidePair(company({'Street Address':'10 Main St.'},{'Street Address':'10 Main Street'})).action,'merge');
});
test('distinct suite numbers stay separate',()=>{
 assert.equal(decidePair(company({'Street Address':'10 Main Street Suite 1'},{'Street Address':'10 Main Street Suite 2'})).action,'reject');
});
test('different cities preserve locations when street data is missing',()=>{
 assert.equal(decidePair(company({'City':'Miami'},{'City':'Houston'})).action,'reject');
});
test('same name with contradictory domains and LinkedIn is rejected',()=>{
 const d=decidePair(company({'Company Domain Name':'one.com','LinkedIn Company Page':'linkedin.com/company/one'},{'Company Domain Name':'two.com','LinkedIn Company Page':'linkedin.com/company/two'}));
 assert.equal(d.action,'reject');
});
test('different government agencies sharing pr.gov are not merged',()=>{
 const p=company({'Company Domain Name':'pr.gov'},{'Company Domain Name':'pr.gov'});
 p.records[0].name='Department of Education';p.records[1].name='Department of Health';
 assert.notEqual(decidePair(p).action,'merge');
});
test('a missing address does not prove a different business',()=>{
 assert.equal(decidePair(company({'Street Address':'10 Main St'},{})).action,'merge');
});
test('company title can establish exact duplicate when custom Company Name is blank',()=>{
 const p=company({'Company Name':'--'},{'Company Name':'--'});p.records.forEach(r=>r.name='NCCO');
 assert.equal(decidePair(p).action,'merge');
});
test('same personal email and same person merge',()=>{
 assert.equal(decidePair(contact({'Email':'maria@example.com'},{'Email':'MARIA@example.com'})).action,'merge');
});
test('contact primary favors newer commercial activity when other continuity signals tie',()=>{
 const d=decidePair(contact({'Email':'maria@example.com','Last Activity Date':'06/30/2025 1:50 PM AST','Phone Number':'12125551234'},{'Email':'maria@example.com','Last Activity Date':'09/21/2026 10:00 AM AST'}));
 assert.equal(d.action,'merge');assert.equal(d.primary,1);
});
test('generic mailbox must not merge different people',()=>{
 assert.notEqual(decidePair(contact({'Email':'info@example.com'},{'Email':'info@example.com'},['Maria Perez','Jose Gomez'])).action,'merge');
});
test('identical names alone do not prove contact identity',()=>{
 assert.equal(decidePair(contact({'Email':'maria@one.com'},{'Email':'maria@two.com'})).action,'reject');
});
test('same contact LinkedIn permits email changes',()=>{
 assert.equal(decidePair(contact({'Email':'maria@one.com','LinkedIn URL':'https://linkedin.com/in/maria-perez'},{'Email':'maria@two.com','LinkedIn URL':'https://www.linkedin.com/in/maria-perez/'})).action,'merge');
});
test('different complete names with conflicting emails and LinkedIn reject',()=>{
 assert.equal(decidePair(contact({'Email':'maria@one.com','LinkedIn URL':'linkedin.com/in/maria'},{'Email':'jose@two.com','LinkedIn URL':'linkedin.com/in/jose'},['Maria Perez','Jose Gomez'])).action,'reject');
});
test('portal guard rejects another portal and lookalike host',()=>{
 assert.doesNotThrow(()=>assertPortal('https://app.hubspot.com/duplicates/123456/companies'));
 assert.throws(()=>assertPortal('https://app.hubspot.com/duplicates/987654/companies'));
 assert.throws(()=>assertPortal('https://app.hubspot.com.evil.test/duplicates/123456/companies'));
});
test('unordered IDs make the same stable checkpoint key',()=>{
 assert.equal(pairKey(company()),pairKey({...company(),records:[...company().records].reverse()}));
});
test('read recovery makes initial attempt plus at most three retries',async()=>{
 let calls=0;const waits=[];
 await assert.rejects(retryRead(async()=>{calls++;throw Error('offline')},{sleep:async ms=>waits.push(ms)}));
 assert.equal(calls,4);assert.deepEqual(waits,[5000,15000,45000]);
});
test('successful read retry returns result without extra attempts',async()=>{
 let calls=0;const result=await retryRead(async()=>{if(++calls===1)throw Error('timeout');return 'fresh'},{sleep:async()=>{}});
 assert.equal(result,'fresh');assert.equal(calls,2);
});
test('unknown click outcome never counts as confirmed solely because pair changed',()=>{
 assert.equal(reconcilePending({key:'companies:101:202',queue:10},{key:'companies:303:404',queue:10}),'unknown');
 assert.equal(reconcilePending({key:'companies:101:202',queue:10},{key:'companies:101:202',queue:10}),'same_pair');
 assert.equal(reconcilePending({key:'companies:101:202',queue:10},{key:'companies:303:404',queue:9}),'queue_advanced');
});
