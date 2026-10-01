import fs from 'node:fs';
import path from 'node:path';
export function csvCell(value){
 let text=String(value??'');
 if(/^[=+@\-\t\r]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function writeReport(directory,state,client){
 const results=Object.values(state.phaseResults||{});
 const current=results.flatMap(r=>Object.values(r.remainingPairs||{}));
 const header=['object','record_1_id','record_1_name','record_1_url','record_2_id','record_2_name','record_2_url','kind','reason','verified_at'];
 const rows=current.map(e=>[e.pair.object,...e.pair.records.flatMap(r=>[r.id,r.name,r.href]),e.kind,e.reason,e.at]);
 fs.writeFileSync(path.join(directory,'remaining-pairs.csv'),[header,...rows].map(row=>row.map(csvCell).join(',')).join('\n')+'\n',{mode:0o600});
 const lines=[`# ${client} duplicate review`, '', `Status: **${state.status}**`, `Updated: ${state.updatedAt}`, '',
 '| Queue | Initial observed | Remaining observed | Verified merges | Verified rejections |', '|---|---:|---:|---:|---:|',
 ...['companies','contacts'].map(o=>`| ${o} | ${state.initial[o]??'Not checked'} | ${state.remaining[o]??'Not checked'} | ${state.counts[o].merge} | ${state.counts[o].reject} |`), '',
 `Current pairs covered by completed verification passes: ${current.length}.`,
 'Counts describe duplicate-pair actions, not unique CRM records. Repeated skip actions are not resolved pairs.',
 'Historical/unconfirmed exceptions remain in checkpoint.json and decisions.jsonl; they are not a live remaining count.',
  'A zero count applies to the configured duplicate queue at this time, not proof that every CRM duplicate has been detected.',
 ...Object.entries(state.phaseResults||{}).map(([object,result])=>`${object} coverage verified: ${result.at}; remaining: ${result.count}.`),
 ...(state.lastError?[`Last issue: ${state.lastError}`]:[]),
 ...(state.pauseReason?[`Reason: ${state.pauseReason}`]:[])];
 fs.writeFileSync(path.join(directory,'review-results.md'),lines.join('\n')+'\n',{mode:0o600});
}
