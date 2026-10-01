import { config } from './config.mjs';
export const PORTAL = config.portalId;
export const RETRY_DELAYS = [5000, 15000, 45000];
export const clean = v => /^(?:--|—|n\/a|null|undefined)?$/i.test(String(v ?? '').trim()) ? '' : String(v).trim();
const norm = v => clean(v).normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const companyName = v => norm(v).replace(/\b(?:incorporated|inc|llc|ltd|limited|corporation|corp|company|co)\b/g,'').replace(/\s+/g,' ').trim();
const url = v => clean(v).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[?#]/)[0].replace(/\/+$/,'');
const domain = v => url(v).split('/')[0];
const field = (r,...names) => { for(const name of names){const aliases=[name,...(config.fieldAliases[name]||[])];const found=Object.entries(r.fields).find(([k])=>aliases.some(alias=>norm(k)===norm(alias)));if(found&&clean(found[1]))return clean(found[1]);}return ''; };
const numeric = v => Number(clean(v).replace(/[^0-9.]/g,''))||0;
const overlap = (a,b) => {const aa=new Set(norm(a).split(' ').filter(Boolean));const bb=new Set(norm(b).split(' ').filter(Boolean));return [...aa].filter(x=>bb.has(x)).length/Math.max(aa.size,bb.size,1);};
const conflict = (a,b,normalize=norm) => !!a&&!!b&&normalize(a)!==normalize(b);
const equal = (a,b,normalize=norm) => !!a&&!!b&&normalize(a)===normalize(b);
const country = v => ({'united states of america':'us','united states':'us','usa':'us','u s a':'us','u s':'us','united kingdom':'uk','great britain':'uk'}[norm(v)]||norm(v));
const address = v => norm(v).replace(/\b(street|avenue|road|boulevard|drive|lane|highway|suite|apartment|north|south|east|west)\b/g,m=>({street:'st',avenue:'ave',road:'rd',boulevard:'blvd',drive:'dr',lane:'ln',highway:'hwy',suite:'ste',apartment:'apt',north:'n',south:'s',east:'e',west:'w'}[m]));

function primary(records,object){
 const hasField=(r,name)=>Object.keys(r.fields).some(k=>[name,...(config.fieldAliases[name]||[])].some(alias=>norm(k)===norm(alias)));
 const dealField=['Number of open deals','Number of Associated Deals'].find(name=>records.every(r=>hasField(r,name)));

 const scores=records.map(r=>[
  dealField?numeric(field(r,dealField)):0,
  /customer|opportunity/i.test(field(r,'Lifecycle Stage'))?1:0,
  numeric(field(r,object==='companies'?'Number of Associated Contacts':'Number of associated companies')),
  field(r,'Company owner','Contact owner','Owner')?1:0,
  Date.parse(field(r,'Last Activity Date','Last Contacted').replace(/ AST$/,' GMT-0400'))||0,
  Object.values(r.fields).filter(v=>clean(v)&&!/^0$/.test(clean(v))).length,
 ]);
 for(let i=0;i<scores[0].length;i++){if(scores[0][i]!==scores[1][i])return scores[1][i]>scores[0][i]?1:0;}
 return 0;
}

export function decidePair(pair){
 if(!['companies','contacts'].includes(pair.object)||pair.records?.length!==2)throw Error('Invalid pair');
 const [a,b]=pair.records;
 const result=(action,reason)=>({action,reason,...(action==='merge'?{primary:primary(pair.records,pair.object)}:{})});
 if(pair.object==='contacts')for(const [kind,names] of Object.entries(config.activeEnrollmentFields||{})){
  for(const r of pair.records)for(const name of names){
   const value=field(r,name);
   if(/^(?:true|yes|active|enrolled|in progress)$/i.test(value))return {...result('defer',`Active ${kind} indicator: ${name} = ${value}`),blockKind:kind};
  }
 }
 if(pair.mergeBlocked)return {...result('defer',pair.mergeBlocked.reason),blockKind:pair.mergeBlocked.kind};
 if(!clean(a.name)||!clean(b.name))return result('defer','Record names are not fully loaded');
 if(pair.object==='companies'){
  for(const [key,normalize] of [['Country',country],['State/Region',norm],['City',norm],['Postal Code',norm],['Street Address',address],['Street Address 2',address]]){
   if(conflict(field(a,key),field(b,key),normalize))return result('reject',`Distinct physical locations: ${key}`);
  }
  const [an,bn]=[companyName(a.name),companyName(b.name)];
  const [ad,bd]=[field(a,'Company Domain Name'),field(b,'Company Domain Name')];
  const [al,bl]=[field(a,'LinkedIn Company Page'),field(b,'LinkedIn Company Page')].map(v=>/^(?:[a-z]{2}\.)?linkedin\.com\/company\/[^/]+/i.test(url(v))?v:'');
  const sameName=!!an&&an===bn;
  const sameLinkedIn=equal(al,bl,url);
  const domainConflict=conflict(ad,bd,domain),linkedInConflict=conflict(al,bl,url);
  if(linkedInConflict)return result('reject','Conflicting LinkedIn company identities');
  if(domainConflict&&!sameLinkedIn)return result('reject','Conflicting company domains; keep records separate');
  if(sameLinkedIn&&(sameName||overlap(an,bn)>=0.5))return result('merge','Same LinkedIn company; compatible name and no location conflict');
  if(sameName&&!domainConflict)return result('merge','Matching company names with no identity or location conflict');
  const sharedDomain=config.sharedCompanyDomains.includes(domain(ad))||/(?:^|\.)(?:gov|gob)(?:\.|$)/.test(domain(ad));
  if(equal(ad,bd,domain)&&!sharedDomain&&overlap(an,bn)>=0.6)return result('merge','Matching domain and strongly matching company name; no location conflict');
  if(domainConflict&&overlap(an,bn)===0)return result('reject','Distinct company identities');
  return result('reject','Insufficient evidence for same business; keep records separate');
 }
 const [an,bn]=[norm(a.name),norm(b.name)];
 const sameName=!!an&&an===bn;
 const compatibleName=sameName||overlap(an,bn)>=0.66;
 const [ae,be]=[field(a,'Email','Email Address').toLowerCase(),field(b,'Email','Email Address').toLowerCase()];
 const [al,bl]=[field(a,'LinkedIn URL','LinkedIn Profile','LinkedIn Profile URL'),field(b,'LinkedIn URL','LinkedIn Profile','LinkedIn Profile URL')].map(v=>/^(?:[a-z]{2}\.)?linkedin\.com\/in\/[^/]+/i.test(url(v))?v:'');
 const [ap,bp]=[field(a,'Mobile Phone Number','Phone Number'),field(b,'Mobile Phone Number','Phone Number')].map(v=>v.replace(/\D/g,''));
 const personalEmail=e=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)&&!config.genericEmailLocals.includes(e.split('@')[0])&&!config.placeholderEmailPatterns.some(p=>new RegExp(p,'i').test(e));
 if(conflict(al,bl,url))return result('reject','Conflicting personal LinkedIn profiles');
 if(equal(al,bl,url)&&compatibleName)return result('merge','Same personal LinkedIn and compatible name');
 if(ae&&ae===be&&personalEmail(ae)&&compatibleName)return result('merge','Same personal email and compatible name');
 if(ap.length>=10&&ap===bp&&sameName)return result('merge','Same full name and telephone');
 if(!compatibleName&&ae&&be&&ae!==be&&overlap(an,bn)===0)return result('reject','Distinct full names and email identities');
 return result('reject','Insufficient independent evidence for the same person; keep records separate');
}

export function assertPortal(value){
 const u=new URL(value,config.hubspotOrigin);
 if(u.origin!==config.hubspotOrigin||!new RegExp(`^/(?:duplicates|contacts)/${PORTAL}(?:/|$)`).test(u.pathname))throw Object.assign(Error('Portal guard: expected configured client '+PORTAL),{code:'PORTAL_MISMATCH'});
}
export function pairKey(p){
 if(p.records.length!==2||!p.records.every(r=>/^\d+$/.test(r.id))||p.records[0].id===p.records[1].id)throw Error('Invalid record IDs');
 return p.object+':'+p.records.map(r=>r.id).sort().join(':');
}
export function reconcilePending(pending,current){
 if(pending.key===current.key)return 'same_pair';
 return current.queue<pending.queue?'queue_advanced':'unknown';
}
export async function retryRead(operation,{sleep=ms=>new Promise(r=>setTimeout(r,ms)),onRetry=async()=>{}}={}){
 for(let attempt=0;;attempt++){
  try{return await operation(attempt);}catch(error){
   if(attempt>=RETRY_DELAYS.length)throw error;
   await sleep(RETRY_DELAYS[attempt]);await onRetry(error,attempt+1);
  }
 }
}
