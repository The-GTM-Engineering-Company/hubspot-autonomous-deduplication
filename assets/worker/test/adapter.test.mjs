import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBoxes } from '../hubspot-ui.mjs';
const boxes=()=>[
 {index:0,name:'Example Foods',href:'/contacts/123456/record/0-2/101',checked:true,terms:[['Create date','03/18/2026']]},
 {index:1,name:'Example Foods',href:'/contacts/123456/record/0-2/202',checked:false,terms:[['Create date','03/19/2026']]},
 ...['Company Name','Company Domain Name','LinkedIn Company Page','Number of Associated Contacts','Industry','Country','City','Street Address'].flatMap((field,i)=>[
  {index:i*2+2,terms:[[field,field==='City'?'Miami':'--']],checked:true},
  {index:i*2+3,terms:[[field,field==='City'?'Miami':'--']],checked:false},
 ])
];
test('decode UI ties each property value to correct record ID',()=>{
 const p=decodeBoxes(boxes(),'companies',9);
 assert.equal(p.records[0].id,'101');assert.equal(p.records[1].id,'202');
 assert.equal(p.records[0].fields.City,'Miami');assert.equal(p.records[0].fields['Company Domain Name'],'');
 assert.equal(p.queue,9);assert.equal(p.selected,0);
});
test('loading cards must not yield an actionable pair',()=>{
 const raw=boxes();raw[1].href='';assert.throws(()=>decodeBoxes(raw,'companies',9));
});
test('record URL from another portal fails closed',()=>{
 const raw=boxes();raw[1].href='/contacts/987654/record/0-2/202';assert.throws(()=>decodeBoxes(raw,'companies',9));
});
test('a missing address comparison cannot silently become a blank address',()=>{
 assert.throws(()=>decodeBoxes(boxes().slice(0,-2),'companies',9));
});
test('misaligned property columns fail closed',()=>{
 const raw=boxes();raw[5].terms=[['City','Bogota']];assert.throws(()=>decodeBoxes(raw,'companies',9));
});
test('company parser must reject contact record URLs',()=>{
 const raw=boxes();raw[1].href='/contacts/123456/record/0-1/202';assert.throws(()=>decodeBoxes(raw,'companies',9));
});
