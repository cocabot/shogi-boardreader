import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const scope='https://example.com/shogi-boardreader/';
function setup(fail=false) {
  const handlers={}, stores=new Map([['other-app',new Map()]]);
  const caches={
    async open(name) {
      if (!stores.has(name)) stores.set(name,new Map());
      const entries=stores.get(name);
      return {async addAll(requests) {
        if(fail) throw new Error('network unavailable');
        for(const req of requests) entries.set(req.url,new Response(req.url));
      },async match(key){return entries.get(key)?.clone();}};
    }, async keys(){return [...stores.keys()];}, async delete(key){return stores.delete(key);}
  };
  const self={registration:{scope},location:{origin:'https://example.com'},clients:{async claim(){}},skipWaiting(){self.skipped=true;},addEventListener(type,fn){handlers[type]=fn;}};
  const source=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8').replace('__VERSION__','test').replace('__ASSETS__',JSON.stringify(['./index.html','./app.js','./vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap','./vendor/pdfjs/wasm/openjpeg.wasm']));
  vm.runInNewContext(source,{self,caches,URL,Request,fetch(){throw new Error('offline');}});
  return {handlers,stores,self};
}
test('offline shell and Japanese PDF resources work without a network',async()=>{
  const {handlers,stores}=setup();
  let task; handlers.install({waitUntil(p){task=p;}});await task;
  handlers.activate({waitUntil(p){task=p;}});await task;
  assert.ok(stores.has('other-app'));
  for(const [path,mode,expected] of [['?from=home','navigate','index.html'],['vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap','cors','vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap'],['vendor/pdfjs/wasm/openjpeg.wasm','cors','vendor/pdfjs/wasm/openjpeg.wasm']]) {
    let response;
    handlers.fetch({request:{url:scope+path,method:'GET',mode},respondWith(p){response=p;}});
    assert.equal(await (await response).text(),scope+expected);
  }
  let intercepted=false;
  handlers.fetch({request:{url:'blob:https://example.com/private-pdf',method:'GET'},respondWith(){intercepted=true;}});
  assert.equal(intercepted,false);
});
test('failed download discards partial cache; activation requires explicit update message',async()=>{
  const {handlers,stores,self}=setup(true);
  let task;handlers.install({waitUntil(p){task=p;}});
  await assert.rejects(task,/network unavailable/);
  assert.deepEqual([...stores.keys()],['other-app']);
  assert.equal(self.skipped,undefined);
  handlers.message({data:{type:'ACTIVATE_UPDATE'}});
  assert.equal(self.skipped,true);
});
