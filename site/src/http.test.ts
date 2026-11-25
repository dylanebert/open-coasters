import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { staticHandler } from '../scripts/serve';
import { boundedPath } from './paths';

test('bounded static HTTP rejects encoded traversal, malformed escapes and symlink escapes', async () => {
  const dir=mkdtempSync(resolve(tmpdir(),'coasters-http-'));
  const root=resolve(dir,'public');mkdirSync(root);mkdirSync(resolve(root,'open-coasters'));
  writeFileSync(resolve(dir,'harmless.txt'),'negative-control');
  writeFileSync(resolve(root,'open-coasters/index.html'),'positive-control');
  symlinkSync(resolve(dir,'harmless.txt'),resolve(root,'escape.txt'));
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:staticHandler(root)});
  try {
    expect(server.hostname).toBe('127.0.0.1');
    const response=await fetch(`${server.url}open-coasters/`);expect(response.status).toBe(200);expect(await response.text()).toBe('positive-control');
    for(const path of ['open-coasters/%2f..%2f..%2fharmless.txt','open-coasters/%2f..%2f..%2f..%2fAGENTS.md','%zz','%E0%A4%A','escape.txt','open-coasters/%5c..%5c..%5charmless.txt']) {
      const result=await fetch(`${server.url}${path}`);expect(result.status).toBe(400);expect(await result.text()).toBe('Bad path');
    }
    expect(()=>boundedPath(root,'../harmless.txt')).toThrow();
    expect(()=>boundedPath(root,'escape.txt')).toThrow();
    expect(()=>boundedPath(root,'../new-output/file')).toThrow();
  } finally {await server.stop(true);rmSync(dir,{recursive:true,force:true});}
});
