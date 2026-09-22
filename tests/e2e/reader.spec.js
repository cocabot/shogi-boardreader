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
  await expect.poll(async()=>page.locator('.board').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(300);

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

test('record load resizes immediately and shows move, diagram label and inline branches',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('separator').press('Home');
  await page.locator('#recordFile').setInputFiles(fixture('book-context.kif'));
  await expect(page.locator('#moveRail')).toBeVisible();

  await expect.poll(async()=>page.evaluate(()=>{
    const board=document.querySelector('.board-frame').getBoundingClientRect();
    const wrap=document.querySelector('.board-wrap').getBoundingClientRect();
    const rail=document.querySelector('#moveRail').getBoundingClientRect();
    return {
      clear: board.bottom <= wrap.bottom + 1,
      railRight: rail.right <= innerWidth + 1,
      boardLeft: board.left,
      boardWidth: board.width,
    };
  })).toMatchObject({clear:true,railRight:true});
  const loadedLayout=await page.evaluate(()=>({
    boardLeft:document.querySelector('.board-frame').getBoundingClientRect().left,
    boardWidth:document.querySelector('.board-frame').getBoundingClientRect().width,
  }));
  expect(loadedLayout.boardWidth).toBeGreaterThan(240);
  expect(loadedLayout.boardLeft).toBeLessThan(70);

  await page.locator('#nextMove').tap();
  await expect(page.locator('#currentMove')).toContainText('1手');
  await expect(page.locator('#currentMove')).toContainText('７六歩');

  await page.locator('#nextMove').tap();
  await expect(page.locator('#positionLabel')).toHaveText('途中図');
  await expect(page.locator('#recordContext')).toBeVisible();
  await expect(page.locator('#recordProgress')).toHaveText('2 / 7手');
  await expect(page.locator('#recordDiagram')).toHaveText('途中図');
  await expect(page.locator('#recordDiagram')).toBeVisible();
  await expect(page.locator('#recordBranch')).toHaveText('本譜');

  await page.locator('#nextMove').tap();
  await expect(page.locator('#moveRail')).toBeVisible();
  await expect(page.locator('#prevMove')).toBeVisible();
  await expect(page.locator('#nextMove')).toBeVisible();
  await expect(page.locator('#branchBox')).toBeVisible();
  const navLayout=await page.evaluate(()=>({
    prevTop:document.querySelector('#prevMove').getBoundingClientRect().top,
    movesTop:document.querySelector('#nearbyMoves').getBoundingClientRect().top,
    nextTop:document.querySelector('#nextMove').getBoundingClientRect().top,
    movesBottom:document.querySelector('#nearbyMoves').getBoundingClientRect().bottom,
    stateHeight:document.querySelector('#recordState').getBoundingClientRect().height,
    visibleRows:document.querySelectorAll('#nearbyMoves button').length,
    rowsOverlap:Array.from(document.querySelectorAll('#nearbyMoves li')).some((el,i,all)=>{
      if(i===all.length-1) return false;
      const a=el.getBoundingClientRect();
      const b=all[i+1].getBoundingClientRect();
      return a.bottom > b.top + 0.5;
    }),
  }));
  expect(navLayout.prevTop).toBeLessThan(navLayout.movesTop);
  expect(navLayout.nextTop).toBeGreaterThanOrEqual(navLayout.movesBottom-1);
  expect(navLayout.stateHeight).toBe(0);
  expect(navLayout.visibleRows).toBeGreaterThanOrEqual(5);
  expect(navLayout.rowsOverlap).toBe(false);
  await expect(page.locator('#branchOrigin')).toContainText('3手目から分岐');
  await expect(page.locator('#branchSelect')).toHaveValue('0');
  await expect(page.locator('#branchSelect option')).toHaveCount(2);
  await expect(page.locator('#nearbyMoves button[aria-current="true"]')).toContainText('3');
  await expect(page.locator('#nearbyMoves button[aria-current="true"]')).toHaveClass(/has-branch/);
  await expect(page.locator('#nearbyMoves')).toContainText('３四歩');
  await expect(page.locator('#nearbyMoves')).toContainText('同');
  await expect(page.locator('#nearbyMoves small')).toHaveCount(0);
  const railCenter=await page.locator('#nearbyMoves').evaluate(list=>{
    const buttons=[...list.querySelectorAll('button')];
    const current=buttons.findIndex(button=>button.getAttribute('aria-current')==='true');
    return {current,count:buttons.length};
  });
  expect(Math.abs(railCenter.current-(railCenter.count-1)/2)).toBeLessThanOrEqual(0.5);

  await page.locator('#nextMove').tap();
  await expect(page.locator('#currentMove')).toContainText('4手');

  await page.locator('#branchSelect').selectOption('1');
  await expect(page.locator('#currentMove')).toContainText('3手');
  await expect(page.locator('#currentMove')).toContainText('２六歩');
  await expect(page.locator('#recordBranch')).toHaveText('3手目からの変化1');
  await expect(page.getByRole('gridcell',{name:'2六 先手 歩',exact:true})).toBeVisible();
  await expect(page.locator('#branchSelect')).toHaveValue('1');

  await page.locator('#nextMove').tap();
  await expect(page.locator('#currentMove')).toContainText('4手');
  await page.locator('#branchSelect').selectOption('0');
  await expect(page.locator('#currentMove')).toContainText('3手');
  await expect(page.locator('#currentMove')).toContainText('２二角成');
  await expect(page.locator('#recordBranch')).toHaveText('本譜');
  await expect(page.locator('#branchSelect')).toHaveValue('0');

  await page.locator('#nextMove').tap();
  await expect(page.locator('#positionLabel')).toHaveText('第１図');
  await expect(page.locator('#nextMove')).toBeEnabled();

  await page.screenshot({path:info.outputPath('record-context.png')});
});

test('side move rail jumps to nearby moves and full list stays in the overflow menu',async({page})=>{
  await page.locator('#recordFile').setInputFiles(fixture('book-context.kif'));
  for(let i=0;i<4;i++) await page.locator('#nextMove').tap();
  const previous=page.locator('#nearbyMoves button').filter({hasText:'２二角成'});
  await expect(previous).toBeVisible();
  await previous.tap();
  await expect(page.locator('#currentMove')).toContainText('3手');
  await page.locator('#boardMenuButton').tap();
  await page.locator('#recordListButton').tap();
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
