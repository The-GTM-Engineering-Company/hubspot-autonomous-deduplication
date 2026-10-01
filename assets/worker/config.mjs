import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root=path.dirname(fileURLToPath(import.meta.url));
export const runtime=path.join(root,'runtime');
export function validateConfig(c){
 if(!/^\d+$/.test(c.portalId)||!/^\d+$/.test(String(c.portalId)))throw Error('A numeric portalId is required');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.clientSlug))throw Error('Use a lowercase client slug');
 if(!c.accountLabel?.trim())throw Error('Exact visible account label is required');
 if(!/^https:\/\/app(?:-[a-z0-9]+)?\.hubspot\.com$/.test(c.hubspotOrigin))throw Error('Only a HubSpot app origin is supported');
 if(!Number.isInteger(c.cdpPort)||c.cdpPort<1024||c.cdpPort>65535)throw Error('Invalid loopback port');
 for(const object of ['companies','contacts'])if(!Array.isArray(c.requiredFields?.[object])||!c.requiredFields[object].length)throw Error('Comparison fields are required for both objects');
 new RegExp(c.emptyStatePattern,'i');
 for(const pattern of c.placeholderEmailPatterns)new RegExp(pattern,'i');
 return {...c,portalId:String(c.portalId)};
}
const filename=path.resolve(root,process.env.HUBSPOT_DEDUPE_CONFIG||'config.json');
export const config=validateConfig(JSON.parse(fs.readFileSync(filename,'utf8')));
export const endpoint=`http://127.0.0.1:${config.cdpPort}`;
export const jobLabel=kind=>`io.gtm-engineering.dedupe-${config.clientSlug}-${config.portalId}-${kind}`;
export const queueURL=object=>`${config.hubspotOrigin}/duplicates/${config.portalId}/${object}?currentPage=1`;
export function assertAuthorized({pilot=false}={}){
 if(!config.authorization?.reference||config.authorization.merge!==true||config.authorization.reject!==true)throw Error('Document client-specific merge/reject authorization before running');
 if(!config.scopeVerified)throw Error('Verify queue scope and remove filters before running');
 if(!pilot&&!config.validated)throw Error('Inspect the live pilot and set validated only after it passes');
}
