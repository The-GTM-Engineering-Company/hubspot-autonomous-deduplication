import { PORTAL, clean, assertPortal, pairKey } from './policy.mjs';
import { config } from './config.mjs';
export const pause = ms => new Promise(r=>setTimeout(r,ms));

export function mergeBlockFromText(text){
 const reason=clean(text);
 if(!/can't|cannot|can not|unable|blocked|prevent|not.*merge/i.test(reason))return null;
 if(/sequence/i.test(reason))return {kind:'sequence',reason};
 if(/campaign/i.test(reason))return {kind:'campaign',reason};
 return null;
}

export function decodeBoxes(boxes,object,queue){
 const cards=boxes.filter(b=>b.href);
 if(cards.length!==2||!Number.isInteger(queue)||queue<0)throw Error('Comparison is incomplete');
 const type=object==='companies'?'0-2':object==='contacts'?'0-1':null;
 if(!type)throw Error('Unsupported object');
 const records=cards.map(card=>{
  assertPortal(card.href);
  const m=new URL(card.href,config.hubspotOrigin).pathname.match(new RegExp(`^/contacts/${PORTAL}/record/${type}/(\\d+)$`));
  if(!m||!clean(card.name)||!card.terms?.some(([k,v])=>k==='Create date'&&clean(v)))throw Error('Record card still loading or wrong object');
  return {id:m[1],name:card.name,href:new URL(card.href,config.hubspotOrigin).href,fields:{}};
 });
 const props=boxes.filter(b=>!b.href);
 if(props.length===0||props.length%2!==0)throw Error('Property columns incomplete');
 const fields=[];
 for(let i=0;i<props.length;i+=2){
  const [a,b]=[props[i],props[i+1]];
  if(a.terms.length!==1||b.terms.length!==1||a.terms[0][0]!==b.terms[0][0])throw Error('Property columns are misaligned');
  const name=a.terms[0][0];
  if(fields.some(f=>f.name===name))throw Error('Ambiguous repeated property label');
  const values=[clean(a.terms[0][1]),clean(b.terms[0][1])];
  records[0].fields[name]=values[0];records[1].fields[name]=values[1];
  fields.push({name,values,indices:[a.index,b.index],checked:[a.checked,b.checked],disabled:[a.disabled,b.disabled]});
 }
 const available=fields.map(f=>f.name.toLowerCase());
 if(!config.requiredFields[object].every(k=>[k,...(config.fieldAliases[k]||[])].some(a=>available.includes(a.toLowerCase()))))throw Error('Configured comparison fields missing; do not interpret absent fields as blanks');
 const pair={object,records,fields,queue,selected:cards.findIndex(c=>c.checked),cardIndices:cards.map(c=>c.index)};
 pairKey(pair);
 return pair;
}

export async function queueCount(page,object){
 assertPortal(page.url());
 const label=object==='companies'?'Companies':'Contacts';
 const text=await page.getByRole('link',{name:new RegExp(`^${label} \\([\\d,]+\\)$`)}).innerText({timeout:10000});
 const m=text.match(/\(([\d,]+)\)/);
 if(!m)throw Error('Queue count unavailable');
 return Number(m[1].replace(/,/g,''));
}

export async function readPair(page,object){
 assertPortal(page.url());
 const account=await page.locator('#hs-global-toolbar-accounts').innerText({timeout:10000});
 if(!account.toLowerCase().includes(config.accountLabel.toLowerCase()))throw Object.assign(Error('Portal name mismatch'),{code:'PORTAL_MISMATCH'});
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Merge and review next',exact:true}).waitFor({timeout:15000});
 await pause(1000);
 let previous='',stable=0,lastError;
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  try{
   const raw=await dialog.getByRole('checkbox').evaluateAll(els=>els.map((el,index)=>({
    index,
    name:el.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]')?.textContent?.trim()||'',
    href:el.querySelector('a[href*="/record/"]')?.getAttribute('href')||'',
    checked:el.getAttribute('aria-checked')==='true'||!!el.querySelector('input:checked'),
    disabled:el.getAttribute('aria-disabled')==='true'||!!el.querySelector('input:disabled'),
    terms:Array.from(el.querySelectorAll('dt')).map(dt=>[dt.textContent.trim(),dt.nextElementSibling?.textContent?.trim()||''])
   })));
   const pair=decodeBoxes(raw,object,await queueCount(page,object));
   const fingerprint=JSON.stringify(pair.records);
   stable=fingerprint===previous?stable+1:0;previous=fingerprint;
   if(stable>=2){
    const merge=dialog.getByRole('button',{name:'Merge and review next',exact:true});
    if(await merge.isEnabled())return pair;
    if(await merge.getAttribute('data-loading')==='true'||await merge.getAttribute('aria-busy')==='true'){
     await pause(350);continue;
    }
    // Sequence restrictions are displayed in a disabled-button tooltip, before any click.
    await page.mouse.move(2,2);
    await pause(150);
    await merge.hover({timeout:3000});
    await pause(500);
    const messages=[...await page.getByRole('tooltip').filter({visible:true}).allTextContents(),...await page.getByRole('alert').filter({visible:true}).allTextContents()];
    pair.mergeBlocked=messages.map(mergeBlockFromText).find(Boolean)||{kind:'unavailable',reason:'Merge button is disabled; no explicit sequence or campaign reason was displayed'};
    return pair;
   }
  }catch(error){if(error.code==='PORTAL_MISMATCH')throw error;lastError=error;stable=0;}
  await pause(350);
 }
 throw lastError||Error('Comparison did not stabilize');
}

export async function peekPair(page,object){
 assertPortal(page.url());
 const records=await page.getByRole('dialog').getByRole('link',{name:/View record/}).evaluateAll(links=>links.map(link=>({
  href:link.getAttribute('href'),name:link.closest('[role="checkbox"]')?.querySelector('h5')?.textContent?.trim()||'',fields:{}
 })));
 if(records.length!==2)throw Error('Pair IDs unavailable');
 const type=object==='companies'?'0-2':'0-1';
 for(const r of records){
  assertPortal(r.href);
  const m=new URL(r.href,config.hubspotOrigin).pathname.match(new RegExp(`^/contacts/${PORTAL}/record/${type}/(\\d+)$`));
  if(!m)throw Error('Invalid record reference');r.id=m[1];r.href=new URL(r.href,config.hubspotOrigin).href;
 }
 const pair={object,records,queue:await queueCount(page,object),unreadable:true};pairKey(pair);return pair;
}

export async function selectValues(page,pair,decision){
 const dialog=page.getByRole('dialog');
 const card=dialog.getByRole('checkbox').nth(pair.cardIndices[decision.primary]);
 if(pair.selected!==decision.primary){
  await card.click({timeout:10000});
  const selected=await card.getByRole('radio').isChecked();
  if(!selected)throw Error('Primary selection not confirmed');
 }
 const current=await readPair(page,pair.object);
 if(pairKey(current)!==pairKey(pair)||current.records[decision.primary].id!==pair.records[decision.primary].id)throw Error('Pair changed while selecting primary');
 for(const f of current.fields){
  if(!f.values[decision.primary]&&f.values[1-decision.primary]&&f.disabled[1-decision.primary]&&!f.checked[1-decision.primary])throw Object.assign(Error('Nonempty secondary value cannot be retained: '+f.name),{code:'VALUE_UNAVAILABLE'});
  if(!f.values[decision.primary]&&f.values[1-decision.primary]&&!f.disabled[1-decision.primary]&&!f.checked[1-decision.primary]){
   await dialog.getByRole('checkbox').nth(f.indices[1-decision.primary]).click({timeout:10000});
  }
 }
 const ready=await readPair(page,pair.object);
 if(pairKey(ready)!==pairKey(pair)||ready.records[decision.primary].id!==pair.records[decision.primary].id||ready.selected!==decision.primary)throw Error('Primary/pair changed before action');
 if(ready.mergeBlocked)return ready;
 for(const f of ready.fields){
  if(!f.values[decision.primary]&&f.values[1-decision.primary]&&!f.disabled[1-decision.primary]&&!f.checked[1-decision.primary])throw Error('Nonempty secondary field not selected');
 }
 return ready;
}

export async function waitForAdvance(page,pair,action){
 const deadline=Date.now()+25000;
 while(Date.now()<deadline){
  assertPortal(page.url());
  const queue=await queueCount(page,pair.object);
  const ids=await page.getByRole('dialog').getByRole('link',{name:/View record/}).evaluateAll(links=>links.map(l=>l.getAttribute('href')));
  const same=ids.length===2&&ids.every(href=>pair.records.some(r=>r.href===new URL(href,config.hubspotOrigin).href));
  if(action==='defer'&&!same&&ids.length===2)return {verified:true,queue};
  if(action!=='defer'&&!same&&queue<pair.queue)return {verified:true,queue};
  if(!await page.getByRole('dialog').count()&&(action==='defer'||queue<pair.queue))return {verified:true,queue};
  if(action==='defer'&&queue===1&&same)return {verified:false,reviewed:true,queue};
  const alerts=await page.getByRole('alert').allTextContents();
  const blockedAlert=alerts.find(t=>/sequence|campaign/i.test(t)&&/unable|error|failed|cannot|can't|blocked|prevent/i.test(t));
  if(blockedAlert){
   const kind=/campaign/i.test(blockedAlert)?'campaign':'sequence';
   const error=new Error(`HubSpot blocked merge because the contact is in a ${kind}: ${blockedAlert}`);
   error.code=kind==='campaign'?'CAMPAIGN_BLOCKED':'SEQUENCE_BLOCKED';throw error;
  }
  if(alerts.some(t=>/unable|error|failed|cannot|can't/i.test(t)))throw Error('HubSpot reported an action error');
  await pause(500);
 }
 throw Error('Action result unconfirmed after 25 seconds');
}
