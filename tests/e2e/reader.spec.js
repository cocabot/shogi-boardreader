import {test,expect} from '@playwright/test';
import path from 'node:path';

const fixture=name=>path.resolve('tests/fixtures',name);

test.beforeEach(async({page})=>{
  await page.goto('./');
  await expect(page.locator('.piece')).toHaveCount(40);
});

test('compact iPhone split keeps the board large and menus out of the way',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('separator').press('Home');

  await expect.poll(async()=>page.locator('#readerPanel').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(360);
  await expect.poll(async()=>page.locator('.board').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(260);

  const splitterHeight=await page.locator('#splitter').evaluate(el=>el.getBoundingClientRect().height);
  expect(splitterHeight).toBeLessThanOrEqual(22);
  await expect(page.locator('#boardMenuDialog')).not.toBeVisible();

  await page.locator('#boardMenuButton').tap();
  await expect(page.locator('#boardMenuDialog')).toBeVisible();
  await expect(page.locator('#recordFile')).toBeAttached();
  await expect(page.locator('#pdfFile')).toBeAttached();
  await expect(page.locator('#pdfStatus')).toBeVisible();
  await expect(page.locator('#undo')).toBeVisible();
  await page.locator('#closeBoardMenu').tap();
  await expect(page.locator('#boardMenuDialog')).not.toBeVisible();

  await page.screenshot({path:info.outputPath('compact-portrait.png')});
});

test('free board move and tucked-away controls work',async({page})=>{
  await page.getByRole('gridcell',{name:'7七 先手 歩',exact:true}).tap();
  await page.getByRole('gridcell',{name:'7六 空きマス',exact:true}).tap();
  await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toHaveClass(/last-to/);

  await page.locator('#boardMenuButton').tap();
  await page.locator('#undo').tap();
  await expect(page.locator('#boardMenuDialog')).not.toBeVisible();
  await expect(page.getByRole('gridcell',{name:'7七 先手 歩',exact:true})).toBeVisible();

  await page.locator('#boardMenuButton').tap();
  await page.locator('#redo').tap();
  await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toBeVisible();

  await page.reload();
  await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toBeVisible();

  await page.locator('#boardMenuButton').tap();
  await page.locator('#flip').tap();
  await expect(page.locator('.square').first()).toHaveAttribute('aria-label','1九 先手 香');
});

test('KIF playback keeps only previous and next controls visible',async({page})=>{
  await page.locator('#recordFile').setInputFiles(fixture('variations.kif'));
  await expect(page.locator('#moveCount')).toHaveText('0 / 7 手');
  await expect(page.locator('#moveRail')).toBeVisible();

  for(let i=0;i<3;i++) await page.locator('#nextMove').tap();
  await expect(page.locator('.piece.promoted')).toHaveText('馬');

  await page.locator('#nextMove').tap();
  await expect(page.locator('#goteHand')).toContainText('角1');

  await page.locator('#boardMenuButton').tap();
  await page.locator('#recordListButton').tap();
  await expect(page.locator('#recordDialog')).toBeVisible();
  await page.getByLabel('3手目の変化').selectOption('1');
  await expect(page.locator('#moveCount')).toHaveText('3 / 4 手');
  await page.locator('#closeRecord').tap();

  await page.locator('#boardMenuButton').tap();
  await page.locator('#firstMove').tap();
  await expect(page.locator('#moveCount')).toHaveText('0 / 4 手');

  await page.locator('#boardMenuButton').tap();
  await page.locator('#lastMove').tap();
  await expect(page.locator('#moveCount')).toHaveText('4 / 4 手');
  await expect(page.locator('#nextMove')).toBeDisabled();
});

test('mobile hands and playback leave the full width for the board',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#recordFile').setInputFiles(fixture('book-context.kif'));
  await page.locator('#boardFit').tap();
  await expect.poll(async()=>page.evaluate(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect();
    const board=rect('.board-frame'), left=rect('.side-hand-left'), right=rect('.side-hand-right'), rail=rect('#moveRail');
    return board.width > 350 && left.bottom <= board.top + 1 && right.bottom <= board.top + 1 && rail.top >= board.bottom - 1 && rail.bottom <= rect('.board-wrap').bottom + 1;
  })).toBe(true);
  await page.locator('#nextMove').tap();
  await page.locator('#nextMove').tap();
  await expect(page.locator('#sceneMarker')).toContainText('途中図');
  const beforeBranch = await page.locator('.board-frame').boundingBox();
  await page.locator('#nextMove').tap();
  await expect(page.locator('#branchTrigger')).toHaveText('分岐あり ▾');
  await expect.poll(async()=> {
    const after = await page.locator('.board-frame').boundingBox();
    return Math.abs(after.width-beforeBranch.width)+Math.abs(after.y-beforeBranch.y);
  }).toBeLessThan(1);
  await page.locator('#branchTrigger').tap();
  await expect(page.locator('#sceneDialog')).toBeVisible();
  await expect(page.locator('#quickMove')).toContainText('２二角成');
  await page.locator('#sceneChoices button').filter({hasText:'変化1'}).tap();
  await expect(page.locator('#quickMove')).toContainText('２六歩');
  await expect(page.locator('#quickContext')).toContainText('変化1');
  await page.locator('#recordQuickList').tap();
  await expect(page.locator('#recordDialog')).toBeVisible();
});

for(const name of ['sample.ki2','sample.csa','shift-jis.kif']){
  test(`file picker accepts ${name}`,async({page})=>{
    await page.locator('#recordFile').setInputFiles(fixture(name));
    await expect(page.locator('#nextMove')).toBeEnabled();
    await page.locator('#nextMove').tap();
    await expect(page.getByRole('gridcell',{name:'7六 先手 歩',exact:true})).toBeVisible();
  });
}

test('invalid record reports an error without losing the loaded record',async({page})=>{
  await page.locator('#recordFile').setInputFiles(fixture('variations.kif'));
  await page.locator('#recordFile').setInputFiles({name:'bad.kif',mimeType:'text/plain',buffer:Buffer.from('garbage')});
  await expect(page.locator('#messageDialog')).toBeVisible();
  await page.locator('#closeMessage').tap();
  await expect(page.locator('#moveCount')).toHaveText('0 / 7 手');
});

test('PDF and record actions live in one top menu with no extra PDF strip',async({page})=>{
  await expect(page.locator('.pdf-info')).toHaveCount(0);
  await expect(page.locator('.reader-toolbar #boardMenuButton')).toBeVisible();
  const toolbarHeight=await page.locator('.reader-toolbar').evaluate(el=>el.getBoundingClientRect().height);
  expect(toolbarHeight).toBeLessThanOrEqual(46);
  await page.locator('#boardMenuButton').tap();
  await expect(page.locator('#boardMenuDialog')).toBeVisible();
  await expect(page.locator('#pdfFile')).toBeAttached();
  await expect(page.locator('#recordFile')).toBeAttached();
  await expect(page.locator('#pdfCompat')).toBeVisible();
  await expect(page.locator('#pdfStatus')).toBeVisible();
  const menuColors=await page.evaluate(()=>({
    book:getComputedStyle(document.querySelector('.menu-section-book')).backgroundColor,
    record:getComputedStyle(document.querySelector('.menu-section-record')).backgroundColor,
  }));
  expect(menuColors.book).not.toBe(menuColors.record);
  const rows=await page.locator('#readerPanel').evaluate(el=>getComputedStyle(el).gridTemplateRows.split(' ').length);
  expect(rows).toBe(2);
});

test('Japanese CID PDF renders text correctly on WebKit',async({page},info)=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));

  await page.locator('#pdfFile').setInputFiles(fixture('japanese-cid.pdf'));
  await expect(page.locator('#pageCount')).toHaveText('2');
  await expect(page.locator('#pdfStatus')).not.toContainText('描画中');
  await expect(page.locator('#pdfStatus')).not.toHaveClass(/error/);
  await expect(page.locator('#pdfCanvas')).toBeVisible();

  const ink=await page.locator('#pdfCanvas').evaluate(c=>{
    const ctx=c.getContext('2d');
    const d=ctx.getImageData(0,Math.floor(c.height*.085),c.width,Math.floor(c.height*.085)).data;
    let n=0;
    for(let i=0;i<d.length;i+=4){
      if(d[i]<160&&d[i+1]<160&&d[i+2]<160)n++;
    }
    return n;
  });
  expect(ink).toBeGreaterThan(100);

  await page.locator('#nextPage').tap();
  await page.locator('#prevPage').tap();
  await expect(page.locator('#pdfStatus')).not.toContainText('描画中');
  expect(errors).toEqual([]);

  await page.screenshot({path:info.outputPath('pdf-webkit.png')});
});
