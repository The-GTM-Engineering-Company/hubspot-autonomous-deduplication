import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readPair } from '../hubspot-ui.mjs';
import { decidePair } from '../policy.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

async function fixture(disabled,reason,run){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  const html=`<div id="hs-global-toolbar-accounts">Example Client</div>
   <a href="/duplicates/123456/contacts" data-tab-selected="true">Contacts (7)</a>
   <div role="dialog">
    <div role="checkbox" aria-checked="true"><h5>Example Person</h5><a href="/contacts/123456/record/0-1/101">View record</a><dl><dt>Create date</dt><dd>03/18/2026</dd></dl></div>
    <div role="checkbox" aria-checked="false"><h5>Example Person</h5><a href="/contacts/123456/record/0-1/202">View record</a><dl><dt>Create date</dt><dd>03/19/2026</dd></dl></div>
    <div role="checkbox" aria-checked="true"><dl><dt>Email</dt><dd>example@example.com</dd></dl></div>
    <div role="checkbox" aria-checked="false"><dl><dt>Email</dt><dd>example@example.com</dd></dl></div>
    <div role="checkbox"><dl><dt>LinkedIn URL</dt><dd>--</dd></dl></div>
    <div role="checkbox"><dl><dt>LinkedIn URL</dt><dd>--</dd></dl></div>
    <div role="checkbox"><dl><dt>Phone Number</dt><dd>--</dd></dl></div>
    <div role="checkbox"><dl><dt>Phone Number</dt><dd>--</dd></dl></div>
    <button aria-disabled="${disabled}" data-loading="false" onmouseenter="document.getElementById('reason').hidden=false">Merge and review next</button>
    <button>Reject and review next</button><button>Review next</button>
   </div><div id="reason" role="tooltip" hidden>${reason}</div>`;
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://app.hubspot.com/duplicates/123456/contacts');
  await run(page);
 }finally{await browser.close();}
}

test('loaded contact in a sequence is skipped from disabled-button tooltip without a merge attempt',async()=>{
 await fixture(true,"You can't merge these contacts because example@example.com is enrolled in a sequence.",async page=>{
  const pair=await readPair(page,'contacts');
  assert.equal(pair.mergeBlocked.kind,'sequence');
  assert.equal(decidePair(pair).action,'defer');
  assert.equal(pair.records[0].id,'101');
 });
});
test('readable disabled merge without a known reason is deferred without falsely claiming a sequence',async()=>{
 await fixture(true,'',async page=>{
  const pair=await readPair(page,'contacts');
  assert.equal(pair.mergeBlocked.kind,'unavailable');
  assert.equal(decidePair(pair).action,'defer');
 });
});
test('an enabled contact comparison still follows normal identity rules',async()=>{
 await fixture(false,'',async page=>{
  const pair=await readPair(page,'contacts');
  assert.equal(pair.mergeBlocked,undefined);
  assert.equal(decidePair(pair).action,'merge');
 });
});
