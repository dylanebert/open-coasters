import { createHash } from 'node:crypto';
import { nativeInputs } from './profile-plate';
export const sha256=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const nativeIdentity=(inputs=nativeInputs())=>sha256(JSON.stringify(inputs));
export interface ProfileEvidence {
  nativeIdentity:string;
  sha256:Record<string,string>;
  [key:string]:unknown;
}
export function assertNativeIdentity(evidence:ProfileEvidence) {
  if(evidence.nativeIdentity!==nativeIdentity()) throw Error('Stale profile geometry/view: native capture required');
}
// A recomposition changes only the two derived entries, never source/raw/native evidence.
export function withFinalHashes(evidence:ProfileEvidence|undefined, finals:Record<string,string>) {
  if(!evidence) return undefined;
  assertNativeIdentity(evidence);
  const names=['profile-light.png','profile-dark.png'];
  if(Object.keys(finals).some(name=>!names.includes(name))) throw Error('Only final profile hashes may change');
  return {...evidence,sha256:{...evidence.sha256,...finals}};
}
