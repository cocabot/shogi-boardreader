// Local files stay in this browser. Only bundled rendering resources are fetched.
export function pdfOptions(data, base, compatibility = false) {
  return {
    data, cMapUrl: `${base}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`,
    useSystemFonts: true, disableFontFace: compatibility,
    useWorkerFetch: true, isEvalSupported: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
  };
}

export function canvasScale(width, height, dpr) {
  return Math.min(dpr || 1, 2, 4096 / width, 4096 / height,
    Math.sqrt(4_000_000 / (width * height)));
}

export function setupPdfReader() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('pdfCanvas'), stage = $('pdfStage'), empty = $('pdfEmpty');
  const status = $('pdfStatus'), input = $('pdfFile'), compat = $('pdfCompat');
  const native = $('nativePdf');
  const base = new URL('./vendor/pdfjs/', document.baseURI).href;
  let library, doc, loading, task, file, blobUrl, timer;
  let pageNum = 1, zoom = 1, fit = true, loadID = 0, renderID = 0;
  const report = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };
  function controls() {
    const ready = Boolean(doc);
    for (const id of ['prevPage','nextPage','pageNumber','zoomOut','zoomIn','fitWidth']) $(id).disabled = !ready;
    $('prevPage').disabled = !ready || pageNum <= 1;
    $('nextPage').disabled = !ready || pageNum >= doc.numPages;
    $('pageNumber').value = pageNum;
    $('pageCount').textContent = ready ? doc.numPages : '—';
    $('pageNumber').max = ready ? doc.numPages : 1;
    $('fitWidth').setAttribute('aria-pressed', String(fit));
    compat.disabled = !file;
  }
  async function cancelRender() {
    const old = task;
    if (old) {
      old.cancel();
      await old.promise.catch(() => {});
      if (task === old) task = null;
    }
  }
  async function render(resetScroll = true) {
    if (!doc) return;
    const id = ++renderID, currentDoc = doc;
    controls();
    try {
      await cancelRender();
      if (id !== renderID) return;
      const page = await currentDoc.getPage(pageNum);
      if (id !== renderID || doc !== currentDoc) return;
      const natural = page.getViewport({scale: 1});
      if (fit) zoom = Math.max(0.05, (stage.clientWidth - 12) / natural.width);
      const viewport = page.getViewport({scale: zoom});
      const pixelScale = canvasScale(viewport.width, viewport.height, window.devicePixelRatio);
      // Resize only after the previous canvas task has settled (Safari is strict).
      canvas.width = Math.max(1, Math.floor(viewport.width * pixelScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * pixelScale));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      empty.hidden = true;
      canvas.hidden = false;
      report(`${file.name} · ${pageNum} / ${doc.numPages} ページを描画中…`);
      task = page.render({canvasContext: canvas.getContext('2d', {alpha:false}), viewport,
        transform: [pixelScale,0,0,pixelScale,0,0]});
      const currentTask = task;
      await currentTask.promise;
      if (id !== renderID) return;
      task = null;
      page.cleanup();
      if (resetScroll) stage.scrollTo(0,0);
      report(`${file.name} · ${pageNum} / ${doc.numPages}${compat.checked ? ' · 文字互換表示' : ''}`);
    } catch (error) {
      if (id !== renderID || error.name === 'RenderingCancelledException') return;
      canvas.hidden = true;
      empty.hidden = false;
      report(`描画できませんでした。「文字互換」を切り替えるか「Safariで開く」をお試しください。${error.message}`, true);
    }
  }
  async function open(nextFile, keepPage = false) {
    file = nextFile;
    const id = ++loadID;
    ++renderID;
    clearTimeout(timer);
    report('PDFを読み込み中…');
    canvas.hidden = true;
    empty.hidden = false;
    if (!keepPage) { pageNum = 1; fit = true; compat.checked = false; }
    const oldLoading = loading;
    loading = null;
    doc = null;
    controls();
    try {
      await cancelRender();
      await oldLoading?.destroy();
      if (id !== loadID) return;
      // Lazy loading keeps the board usable even when PDF resources fail.
      library ??= await import('./vendor/pdfjs/pdf.min.mjs');
      if (id !== loadID) return;
      library.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
      const data = new Uint8Array(await file.arrayBuffer());
      if (id !== loadID) return;
      const nextLoading = library.getDocument(pdfOptions(data, base, compat.checked));
      loading = nextLoading;
      nextLoading.onPassword = (update, reason) => {
        if (id !== loadID) return;
        const password = window.prompt(reason === 2 ? 'パスワードが違います。もう一度入力してください。' : 'PDFのパスワードを入力してください。');
        if (password === null) {
          nextLoading.destroy();
          report('パスワード入力をキャンセルしました。PDFを選び直せます。', true);
        } else update(password);
      };
      const nextDoc = await nextLoading.promise;
      if (id !== loadID) { await nextDoc.destroy(); return; }
      doc = nextDoc;
      pageNum = Math.min(pageNum, doc.numPages);
      await render();
    } catch (error) {
      if (id !== loadID) return;
      report(`PDFを開けませんでした。暗号化・破損、または表示用ファイルの読み込み失敗の可能性があります。${error.message}`, true);
    }
    if (id === loadID) controls();
  }
  input.addEventListener('change', () => {
    const selected = input.files?.[0];
    input.value = '';
    if (!selected) return;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(selected);
    native.href = blobUrl;
    native.hidden = false;
    open(selected);
  });
  compat.addEventListener('change', () => { if (file) open(file, true); });
  function go(value) {
    if (!doc) return;
    const target = Math.min(doc.numPages, Math.max(1, Math.trunc(Number(value))));
    if (!Number.isFinite(target)) { controls(); return; }
    if (pageNum !== target) { pageNum = target; render(); }
    else controls();
  }
  $('prevPage').onclick = () => go(pageNum - 1);
  $('nextPage').onclick = () => go(pageNum + 1);
  $('pageNumber').onchange = (event) => go(event.target.value);
  for (const [id, multiplier] of [['zoomIn',1.2], ['zoomOut',1/1.2]]) {
    $(id).onclick = () => { fit = false; zoom = Math.max(0.05, Math.min(5, zoom * multiplier)); render(false); };
  }
  $('fitWidth').onclick = () => { fit = true; render(false); };
  let swipe;
  stage.addEventListener('touchstart', (event) => {
    swipe = event.touches.length === 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY} : null;
  }, {passive:true});
  stage.addEventListener('touchend', (event) => {
    const start = swipe; swipe = null;
    if (!start || event.changedTouches.length !== 1 || stage.scrollWidth > stage.clientWidth + 4) return;
    const dx = event.changedTouches[0].clientX-start.x, dy=event.changedTouches[0].clientY-start.y;
    if (Math.abs(dx)>80 && Math.abs(dx)>Math.abs(dy)*1.8) go(pageNum+(dx<0?1:-1));
  }, {passive:true});
  stage.addEventListener('touchcancel', () => { swipe = null; });
  controls();
  return () => { if (doc && fit) { clearTimeout(timer); timer = setTimeout(() => render(false), 140); } };
}
