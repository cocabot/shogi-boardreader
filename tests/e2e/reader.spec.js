import {test,expect} from '@playwright/test';
import path from 'node:path';
const fixture=name=>path.resolve('tests/fixtures',name);
test.beforeEach(async({page})=>{await page.goto('./');await expect(page.locator('.piece')).toHaveCount(40);});

test('board fits portrait sizes and splitter extremes with contained glyphs',async({page},info)=>{
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]){
  await page.setViewportSize({width,height});
  for(const presses of [0,8,-12]){
   const separator=page.getByRole('separator');await separator.focus();
   for(let i=0;i<Math.abs(presses);i++)await separator.press(presses>0?'ArrowDown':'ArrowUp');
   await expect.poll(async()=>page.locator('.board').evaluate(board=>{
    const rect=board.getBoundingClientRect();const wrap=board.closest('.board-wrap').getBoundingClientRect();
    const ok=rect.width>60&&rect.left>=0&&rect.right<=innerWidth&&rect.top>=wrap.top-1&&rect.bottom<=wrap.bottom+1;
    const contained=[...board.querySelectorAll('.piece')].every(piece=>{
     const p=piece.getBoundingClientRect(),s=piece.parentElement.getBoundingClientRect(),g=piece.firstChild.getBoundingClientRect();
     return p.left>=s.left-1&&p.right<=s.right+1&&p.top>=s.top-1&&p.bottom<=s.bottom+1&&g.left>=p.left-1&&g.right<=p.right+1&&g.top>=p.top-1&&g.bottom<=p.bottom+1;
    });return ok&&contained&&document.documentElement.scrollWidth<=innerWidth;
   })).toBe(true);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('separator').press('Home');
 await page.screenshot({path:info.outputPath('portrait.png')});
});

test('free board moves, undo, redo, flip and persistence',async({page})=>{
 await page.getByRole('gridcell',{name:'7七 先手 歩',exact:true}).tap();
 await page.getByRole('gridcell',{name:'7六 空きマス',exact:true}).tap();
 await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toHaveClass(/last-to/);
 await page.getByRole('button',{name:'↶ 待った',exact:true}).tap();
 await expect(page.getByRole('gridcell',{name:'7七 先手 歩',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'↷ やり直し',exact:true}).tap();
 await page.reload();await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'⇅ 反転',exact:true}).tap();
 await expect(page.locator('.square').first()).toHaveAttribute('aria-label','1九 先手 香');
 await expect(page.locator('.hand-top')).toHaveAttribute('aria-label','先手の持ち駒');
});

test('KIF playback, captures, drops, jumps, branches and study keeps original',async({page})=>{
 await page.locator('#recordFile').setInputFiles(fixture('variations.kif'));
 await expect(page.locator('#moveCount')).toHaveText('0 / 7 手');
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'次の手',exact:true}).tap();
 await expect(page.locator('.piece.promoted')).toHaveText('馬');
 await page.getByRole('button',{name:'次の手',exact:true}).tap();
 await expect(page.locator('#goteHand')).toContainText('角1');
 await page.getByRole('button',{name:'次の手',exact:true}).tap();
 await expect(page.getByRole('gridcell',{name:'4五 先手 角',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'棋譜一覧',exact:true}).tap();
 await page.getByLabel('3手目の変化').selectOption('1');
 await expect(page.locator('#moveCount')).toHaveText('3 / 4 手');
 await page.getByLabel('4手目の変化').selectOption('1');
 await expect(page.locator('#moveCount')).toHaveText('4 / 5 手');
 await page.getByRole('button',{name:'本譜に戻る',exact:true}).tap();
 await page.locator('.move-jump').nth(3).tap();
 await expect(page.locator('#moveCount')).toHaveText('3 / 7 手');
 await page.getByRole('button',{name:'棋譜一覧',exact:true}).tap();
 await page.getByRole('button',{name:'この局面で検討',exact:true}).tap();
 await expect(page.locator('#boardMode')).toHaveText('検討中');
 await page.getByRole('gridcell',{name:'2二 先手 馬',exact:true}).tap();
 await page.getByRole('gridcell',{name:'5五 空きマス',exact:true}).tap();
 await page.getByRole('button',{name:'先頭',exact:true}).tap();
 await expect(page.locator('.piece')).toHaveCount(40);
 await page.getByRole('button',{name:'最後',exact:true}).tap();
 await expect(page.locator('#moveCount')).toHaveText('7 / 7 手');
 await expect(page.getByRole('button',{name:'次の手',exact:true})).toBeDisabled();
});
for(const name of ['sample.ki2','sample.csa','shift-jis.kif'])test(`file picker accepts ${name}`,async({page})=>{
 await page.locator('#recordFile').setInputFiles(fixture(name));
 await expect(page.locator('#nextMove')).toBeEnabled();
 await page.getByRole('button',{name:'次の手',exact:true}).tap();
 await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toBeVisible();
});

test('invalid file reports error without destroying current record',async({page})=>{
 await page.locator('#recordFile').setInputFiles(fixture('variations.kif'));
 await page.locator('#recordFile').setInputFiles({name:'bad.kif',mimeType:'text/plain',buffer:Buffer.from('garbage')});
 await expect(page.getByRole('dialog')).toBeVisible();await page.locator('#closeMessage').tap();
 await expect(page.locator('#moveCount')).toHaveText('0 / 7 手');
});

test('Japanese CID PDF text, canvas bounds, rapid navigation and local-only network',async({page},info)=>{
 const requests=[],errors=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#pdfFile').setInputFiles(fixture('japanese-cid.pdf'));
 await expect(page.locator('#pageCount')).toHaveText('2');
 await expect(page.locator('#pdfStatus')).not.toContainText('描画中');
 await expect(page.locator('#pdfStatus')).not.toHaveClass(/error/);
 await expect(page.locator('#pdfCanvas')).toBeVisible();
 // Top text-only band must contain actual painted glyphs, not just page/board borders.
 const ink=await page.locator('#pdfCanvas').evaluate(c=>{
  const ctx=c.getContext('2d'),d=ctx.getImageData(0,Math.floor(c.height*.085),c.width,Math.floor(c.height*.085)).data;
  let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<160&&d[i+1]<160&&d[i+2]<160)n++;return n;
 });expect(ink).toBeGreaterThan(100);
 expect(requests.some(r=>r.url.includes('UniJIS-UCS2-H.bcmap'))).toBe(true);
 for(let i=0;i<6;i++){await page.locator('#nextPage').tap();await page.locator('#prevPage').tap();}
 await page.locator('#zoomIn').tap();await page.locator('#zoomIn').tap();
 await expect(page.locator('#pdfStatus')).not.toContainText('描画中');
 expect(await page.locator('#pdfCanvas').evaluate(c=>c.width*c.height)).toBeLessThanOrEqual(4_000_000);
 await page.getByText('表示設定',{exact:true}).tap();await page.getByLabel('文字互換表示',{exact:true}).check();
 await expect(page.locator('#pdfStatus')).toContainText('文字互換表示');
 await expect(page.locator('#pdfStatus')).not.toHaveClass(/error/);
 expect(errors).toEqual([]);expect(requests.every(r=>r.url.startsWith('http://127.0.0.1:8000/')&&r.method==='GET')).toBe(true);
 await page.screenshot({path:info.outputPath('pdf-cid.png')});
});
