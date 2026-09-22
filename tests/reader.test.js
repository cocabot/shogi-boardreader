import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRecord, decodeRecord, recordGame} from '../record-reader.js';
import {pdfOptions, canvasScale} from '../pdf-reader.js';
const load = name => parseRecord(readFileSync(new URL(`fixtures/${name}`, import.meta.url)), name);
const at = (game,file,rank) => game.board[(rank-1)*9+9-file];

test('KIF capture, promotion, recapture, drop and reversible navigation', () => {
 const r=load('variations.kif');
 assert.equal(r.current.ply,0); assert.equal(r.length,7);
 r.goto(3); let g=recordGame(r); assert.deepEqual(at(g,2,2),{type:'B',promoted:true,owner:'b'}); assert.equal(g.hands.b.B,1);
 r.goto(4); g=recordGame(r); assert.equal(g.hands.w.B,1); assert.deepEqual(at(g,2,2),{type:'S',promoted:false,owner:'w'});
 r.goto(5); g=recordGame(r); assert.equal(g.hands.b.B,0); assert.equal(at(g,4,5).type,'B'); assert.equal(g.lastMove.from,null);
 r.goto(0); assert.equal(recordGame(r).board.filter(Boolean).length,40);
 r.goto(6); const expected=r.sfen; r.goto(1); r.goto(6); assert.equal(r.sfen,expected);
});
test('KIF branches including a nested variation preserve both lines', () => {
 const r=load('variations.kif'); r.goto(3); assert.equal(r.switchBranchByIndex(1),true);
 assert.equal(at(recordGame(r),2,6).type,'P'); assert.equal(r.length,4);
 r.goto(4); assert.equal(r.switchBranchByIndex(1),true); assert.equal(at(recordGame(r),8,8).promoted,true);
 r.goto(5); assert.equal(recordGame(r).hands.b.B,1);
 r.goto(0); r.resetAllBranchSelection(); r.goto(3); assert.equal(at(recordGame(r),2,2).promoted,true);
});
for (const name of ['sample.ki2','sample.csa']) test(`${name} matches KIF board at ply 6`,()=>{
 const r=load(name),k=load('variations.kif'); r.goto(6);k.goto(6);assert.deepEqual(recordGame(r),recordGame(k));
});
test('handicap starts with white and missing rook/bishop',()=>{
 const r=load('handicap.kif'); const g=recordGame(r);assert.equal(g.turn,'w');assert.equal(at(g,8,2),null);assert.equal(at(g,2,2),null);
 r.goto(1);assert.equal(recordGame(r).turn,'b');
});
test('Shift-JIS, UTF-8 BOM, UTF-16 BOM and invalid files',()=>{
 assert.equal(decodeRecord(Uint8Array.from([0x90,0xe6,0x8e,0xe8])), '先手');
 const bom=Buffer.concat([Buffer.from([239,187,191]),Buffer.from('手合割：平手')]);assert.equal(parseRecord(bom,'a.kif').length,0);
 const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from('手合割：平手','utf16le')]);assert.equal(parseRecord(utf16,'a.kif').length,0);
 assert.throws(()=>parseRecord(Buffer.from('not a game'),'a.kif'));
 assert.throws(()=>parseRecord(Buffer.from(''),'a.ki2'));
 assert.throws(()=>parseRecord(Buffer.from('PI\n+\n/\nPI\n+'),'a.csa'));
 assert.throws(()=>parseRecord(Buffer.from('手合割：平手\n1 ７六歩(55)'),'a.kif'));
});
test('PDF font resources share a versioned local base and stay explicitly configured',()=>{
 const data=new Uint8Array([1]);const normal=pdfOptions(data,'https://example.test/shogi-boardreader/vendor/pdfjs/');
 assert.equal(normal.data,data);assert.equal(normal.cMapPacked,true);assert.equal(normal.useSystemFonts,true);assert.equal(normal.disableFontFace,false);
 for(const key of ['cMapUrl','standardFontDataUrl','wasmUrl']) assert.match(normal[key],/^https:\/\/example.test\/shogi-boardreader\/vendor\/pdfjs\/.*\/$/);
 assert.equal(pdfOptions(data,'./',true).disableFontFace,true);
});
test('huge PDF pages and retina zoom never exceed the Safari canvas budget',()=>{
 for(const [w,h,dpr] of [[400,600,3],[4000,8000,3],[20000,100,2],[120,10000,3]]) {
 const s=canvasScale(w,h,dpr); assert.ok(w*h*s*s<=4_000_001);assert.ok(w*s<=4096);assert.ok(h*s<=4096);
 }
});
