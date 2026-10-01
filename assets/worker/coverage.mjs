// Two matching, mutation-free passes prove coverage of the currently visible queue.
export function newPass(object,startCount){
 return {object,startCount,startedAt:new Date().toISOString(),seen:{},pageSeen:[],resolved:0,pages:1};
}
export function assessPass(pass,endCount,previous){
 if(!Number.isInteger(endCount)||endCount<0)throw Error('Missing live count is not zero');
 const keys=Object.keys(pass.seen).sort();
 const complete=pass.resolved===0&&pass.startCount===endCount&&keys.length===endCount;
 const signature=JSON.stringify(keys.map(key=>[key,pass.seen[key].kind,pass.seen[key].reason]));
 if(pass.resolved>0||pass.startCount!==endCount)return {status:'progress',signature};
 if(!complete)return {status:'incomplete',signature};
 if(previous?.status==='candidate'&&previous.signature===signature)return {status:'covered',signature};
 return {status:'candidate',signature};
}
export function stableEmptyEvidence(samples){
 return samples.length>=4&&samples.every(s=>s.count===0&&s.reviewRows===0&&s.active===true&&s.emptyVisible===true&&!s.loading);
}
