import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs";

const $ = (selector) => document.querySelector(selector);

const app = $("#app");
const readerPanel = $("#readerPanel");
const boardPanel = $("#boardPanel");
const splitter = $("#splitter");
const splitHalf = $("#splitHalf");

const pdfFile = $("#pdfFile");
const pdfStage = $("#pdfStage");
const pdfCanvas = $("#pdfCanvas");
const pdfEmpty = $("#pdfEmpty");
const prevPage = $("#prevPage");
const nextPage = $("#nextPage");
const pageNumber = $("#pageNumber");
const pageCount = $("#pageCount");
const zoomOut = $("#zoomOut");
const zoomIn = $("#zoomIn");
const fitWidth = $("#fitWidth");

const boardEl = $("#board");
const senteHandEl = $("#senteHand");
const goteHandEl = $("#goteHand");
const promotionBar = $("#promotionBar");
const promoteYes = $("#promoteYes");
const promoteNo = $("#promoteNo");
const undoButton = $("#undo");
const redoButton = $("#redo");
const flipButton = $("#flip");
const resetButton = $("#reset");

let pdfDocument = null;
let pageNum = 1;
let zoom = 1;
let fitToWidth = true;
let renderTask = null;
let renderToken = 0;

function setReaderRatio(ratio) {
  const clamped = Math.max(0.28, Math.min(0.7, ratio));
  document.documentElement.style.setProperty("--reader-ratio", clamped.toFixed(3));
  localStorage.setItem("shogi-boardreader:split", String(clamped));
  queuePdfRender();
  sizeBoard();
}

const savedRatio = Number(localStorage.getItem("shogi-boardreader:split"));
setReaderRatio(Number.isFinite(savedRatio) && savedRatio > 0 ? savedRatio : 0.5);

let splitterDrag = null;

splitter.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  splitterDrag = event.pointerId;
  splitter.setPointerCapture(event.pointerId);
});

splitter.addEventListener("pointermove", (event) => {
  if (splitterDrag !== event.pointerId) return;
  const rect = app.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  setReaderRatio(ratio);
});

function endSplitterDrag(event) {
  if (splitterDrag !== event.pointerId) return;
  splitterDrag = null;
  if (splitter.hasPointerCapture(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId);
  }
}

splitter.addEventListener("pointerup", endSplitterDrag);
splitter.addEventListener("pointercancel", endSplitterDrag);
splitHalf.addEventListener("click", () => setReaderRatio(0.5));

pdfFile.addEventListener("change", async () => {
  const [file] = pdfFile.files || [];
  if (!file) return;

  pdfEmpty.hidden = false;
  pdfEmpty.innerHTML = "<strong>PDFを読み込み中…</strong><span></span>";

  try {
    const data = await file.arrayBuffer();
    pdfDocument = await pdfjsLib.getDocument({ data }).promise;
    pageNum = 1;
    pageCount.textContent = String(pdfDocument.numPages);
    pageNumber.max = String(pdfDocument.numPages);
    pageNumber.value = "1";
    fitToWidth = true;
    fitWidth.setAttribute("aria-pressed", "true");
    document.title = `${file.name} – 将棋 BoardReader`;
    await renderPdfPage();
  } catch (error) {
    console.error(error);
    pdfDocument = null;
    pdfCanvas.hidden = true;
    pdfEmpty.hidden = false;
    pdfEmpty.innerHTML =
      "<strong>PDFを開けませんでした</strong><span>別のPDFを選び直してください。</span>";
  }

  updatePdfControls();
});

async function renderPdfPage() {
  if (!pdfDocument) return;

  const token = ++renderToken;
  const page = await pdfDocument.getPage(pageNum);
  if (token !== renderToken) return;

  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(120, pdfStage.clientWidth - 10);
  const scale = fitToWidth
    ? Math.max(0.25, availableWidth / baseViewport.width)
    : zoom;
  const viewport = page.getViewport({ scale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2.5);

  pdfCanvas.width = Math.floor(viewport.width * outputScale);
  pdfCanvas.height = Math.floor(viewport.height * outputScale);
  pdfCanvas.style.width = `${Math.floor(viewport.width)}px`;
  pdfCanvas.style.height = `${Math.floor(viewport.height)}px`;
  pdfCanvas.hidden = false;
  pdfEmpty.hidden = true;

  const context = pdfCanvas.getContext("2d", { alpha: false });
  const transform =
    outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];

  if (renderTask) {
    try {
      renderTask.cancel();
    } catch {
      // A completed render cannot be cancelled; safe to ignore.
    }
  }

  renderTask = page.render({
    canvasContext: context,
    transform,
    viewport,
  });

  try {
    await renderTask.promise;
    if (token === renderToken) {
      pdfStage.scrollTo({ top: 0, left: 0 });
    }
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      console.error(error);
    }
  } finally {
    if (token === renderToken) renderTask = null;
  }

  updatePdfControls();
}

let renderTimer = null;
function queuePdfRender() {
  if (!pdfDocument || !fitToWidth) return;
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderPdfPage, 100);
}

function updatePdfControls() {
  const ready = Boolean(pdfDocument);
  prevPage.disabled = !ready || pageNum <= 1;
  nextPage.disabled = !ready || pageNum >= (pdfDocument?.numPages ?? 1);
  pageNumber.disabled = !ready;
  zoomOut.disabled = !ready;
  zoomIn.disabled = !ready;
  fitWidth.disabled = !ready;
  if (ready) {
    pageNumber.value = String(pageNum);
    pageCount.textContent = String(pdfDocument.numPages);
  }
}

async function goToPage(next) {
  if (!pdfDocument) return;
  const target = Math.max(1, Math.min(pdfDocument.numPages, Number(next)));
  if (!Number.isFinite(target) || target === pageNum) return;
  pageNum = target;
  await renderPdfPage();
}

prevPage.addEventListener("click", () => goToPage(pageNum - 1));
nextPage.addEventListener("click", () => goToPage(pageNum + 1));

pageNumber.addEventListener("change", () => {
  goToPage(Number(pageNumber.value));
});

zoomOut.addEventListener("click", () => {
  if (!pdfDocument) return;
  fitToWidth = false;
  zoom = Math.max(0.5, zoom - 0.15);
  fitWidth.setAttribute("aria-pressed", "false");
  renderPdfPage();
});

zoomIn.addEventListener("click", () => {
  if (!pdfDocument) return;
  fitToWidth = false;
  zoom = Math.min(3.5, zoom + 0.15);
  fitWidth.setAttribute("aria-pressed", "false");
  renderPdfPage();
});

fitWidth.addEventListener("click", () => {
  if (!pdfDocument) return;
  fitToWidth = true;
  fitWidth.setAttribute("aria-pressed", "true");
  renderPdfPage();
});

let pdfSwipeStart = null;
pdfStage.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    pdfSwipeStart = { x: touch.clientX, y: touch.clientY };
  },
  { passive: true },
);

pdfStage.addEventListener(
  "touchend",
  (event) => {
    if (!pdfSwipeStart || !pdfDocument || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - pdfSwipeStart.x;
    const dy = touch.clientY - pdfSwipeStart.y;
    pdfSwipeStart = null;

    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (pdfStage.scrollWidth > pdfStage.clientWidth + 4) return;

    if (dx < 0) goToPage(pageNum + 1);
    else goToPage(pageNum - 1);
  },
  { passive: true },
);

const PIECE_LABEL = {
  P: "歩",
  L: "香",
  N: "桂",
  S: "銀",
  G: "金",
  B: "角",
  R: "飛",
  K: "玉",
};

const PROMOTED_LABEL = {
  P: "と",
  L: "杏",
  N: "圭",
  S: "全",
  B: "馬",
  R: "龍",
};

const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];
const PROMOTABLE = new Set(["P", "L", "N", "S", "B", "R"]);

function emptyHands() {
  const side = () => Object.fromEntries(HAND_ORDER.map((type) => [type, 0]));
  return { b: side(), w: side() };
}

function createInitialBoard() {
  const board = Array(81).fill(null);

  const place = (file, rank, type, owner) => {
    const col = 9 - file;
    const row = rank - 1;
    board[row * 9 + col] = { type, owner, promoted: false };
  };

  const backRank = ["L", "N", "S", "G", "K", "G", "S", "N", "L"];

  backRank.forEach((type, col) => {
    board[col] = { type, owner: "w", promoted: false };
    board[72 + col] = { type, owner: "b", promoted: false };
  });

  place(8, 2, "R", "w");
  place(2, 2, "B", "w");
  for (let file = 1; file <= 9; file += 1) place(file, 3, "P", "w");

  for (let file = 1; file <= 9; file += 1) place(file, 7, "P", "b");
  place(8, 8, "B", "b");
  place(2, 8, "R", "b");

  return board;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let game = {
  board: createInitialBoard(),
  hands: emptyHands(),
  flipped: false,
  lastMove: null,
};

let history = [];
let future = [];
let selected = null;
let pendingPromotion = null;
let suppressClick = false;

function loadBoardState() {
  try {
    const saved = JSON.parse(localStorage.getItem("shogi-boardreader:board") || "null");
    if (
      saved &&
      Array.isArray(saved.board) &&
      saved.board.length === 81 &&
      saved.hands?.b &&
      saved.hands?.w
    ) {
      game = saved;
    }
  } catch (error) {
    console.warn("Could not restore board state", error);
  }
}

function saveBoardState() {
  localStorage.setItem("shogi-boardreader:board", JSON.stringify(game));
}

function snapshot() {
  return clone(game);
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 200) history.shift();
  future = [];
}

function modelIndexFromDisplay(displayRow, displayCol) {
  const row = game.flipped ? 8 - displayRow : displayRow;
  const col = game.flipped ? 8 - displayCol : displayCol;
  return row * 9 + col;
}

function pieceLabel(piece) {
  if (piece.promoted && PROMOTED_LABEL[piece.type]) {
    return PROMOTED_LABEL[piece.type];
  }
  if (piece.type === "K" && piece.owner === "w") return "王";
  return PIECE_LABEL[piece.type];
}

function isOpponentFacing(piece) {
  const viewer = game.flipped ? "w" : "b";
  return piece.owner !== viewer;
}

function renderBoard() {
  boardEl.replaceChildren();

  for (let displayRow = 0; displayRow < 9; displayRow += 1) {
    for (let displayCol = 0; displayCol < 9; displayCol += 1) {
      const index = modelIndexFromDisplay(displayRow, displayCol);
      const square = document.createElement("div");
      square.className = "square";
      square.dataset.index = String(index);
      square.setAttribute("role", "gridcell");

      if (selected?.kind === "board" && selected.index === index) {
        square.classList.add("selected");
      }

      if (game.lastMove?.from === index) square.classList.add("last-from");
      if (game.lastMove?.to === index) square.classList.add("last-to");

      const piece = game.board[index];
      if (piece) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "piece";
        if (piece.promoted) pieceEl.classList.add("promoted");
        if (isOpponentFacing(piece)) pieceEl.classList.add("opponent");
        pieceEl.textContent = pieceLabel(piece);
        pieceEl.dataset.index = String(index);
        pieceEl.setAttribute(
          "aria-label",
          `${piece.owner === "b" ? "先手" : "後手"} ${pieceLabel(piece)}`,
        );
        square.append(pieceEl);
      }

      boardEl.append(square);
    }
  }

  renderHands();
  undoButton.disabled = history.length === 0;
  redoButton.disabled = future.length === 0;
  flipButton.textContent = game.flipped ? "⇅ 先手側" : "⇅ 反転";
  saveBoardState();
}

function renderHands() {
  renderHand("w", goteHandEl);
  renderHand("b", senteHandEl);
}

function renderHand(owner, container) {
  container.replaceChildren();

  const sideLabel = document.createElement("span");
  sideLabel.className = "hand-side";
  sideLabel.textContent = owner === "b" ? "先手" : "後手";
  sideLabel.style.fontSize = "11px";
  sideLabel.style.color = "var(--muted)";
  container.append(sideLabel);

  for (const type of HAND_ORDER) {
    const count = game.hands[owner][type];
    if (!count) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-piece";
    if (
      selected?.kind === "hand" &&
      selected.owner === owner &&
      selected.type === type
    ) {
      button.classList.add("selected");
    }
    button.dataset.owner = owner;
    button.dataset.type = type;
    button.textContent = `${PIECE_LABEL[type]}×${count}`;
    container.append(button);
  }

  if (!HAND_ORDER.some((type) => game.hands[owner][type] > 0)) {
    const empty = document.createElement("span");
    empty.textContent = "持駒なし";
    empty.style.fontSize = "11px";
    empty.style.color = "var(--muted)";
    container.append(empty);
  }
}

function rankOf(index) {
  return Math.floor(index / 9) + 1;
}

function inPromotionZone(owner, index) {
  const rank = rankOf(index);
  return owner === "b" ? rank <= 3 : rank >= 7;
}

function clearPromotionPrompt() {
  pendingPromotion = null;
  promotionBar.hidden = true;
}

function maybeAskPromotion(piece, from, to) {
  if (
    !piece.promoted &&
    PROMOTABLE.has(piece.type) &&
    (inPromotionZone(piece.owner, from) || inPromotionZone(piece.owner, to))
  ) {
    pendingPromotion = { to };
    promotionBar.hidden = false;
  } else {
    clearPromotionPrompt();
  }
}

function attemptBoardMove(from, to) {
  if (from === to) {
    selected = null;
    renderBoard();
    return;
  }

  const moving = game.board[from];
  if (!moving) return;

  const target = game.board[to];
  if (target?.owner === moving.owner) {
    selected = { kind: "board", index: to };
    renderBoard();
    return;
  }

  pushHistory();
  clearPromotionPrompt();

  if (target) {
    game.hands[moving.owner][target.type] += 1;
  }

  game.board[to] = { ...moving };
  game.board[from] = null;
  game.lastMove = { from, to };
  selected = null;

  maybeAskPromotion(game.board[to], from, to);
  renderBoard();
}

function dropFromHand(selection, to) {
  if (game.board[to]) return;
  if (game.hands[selection.owner][selection.type] <= 0) return;

  pushHistory();
  clearPromotionPrompt();

  game.hands[selection.owner][selection.type] -= 1;
  game.board[to] = {
    type: selection.type,
    owner: selection.owner,
    promoted: false,
  };
  game.lastMove = { from: null, to };
  selected = null;
  renderBoard();
}

function selectSquare(index) {
  const piece = game.board[index];

  if (selected?.kind === "hand") {
    if (!piece) dropFromHand(selected, index);
    else {
      selected = { kind: "board", index };
      renderBoard();
    }
    return;
  }

  if (selected?.kind === "board") {
    attemptBoardMove(selected.index, index);
    return;
  }

  if (piece) {
    selected = { kind: "board", index };
    renderBoard();
  }
}

boardEl.addEventListener("click", (event) => {
  if (suppressClick) return;
  const square = event.target.closest(".square");
  if (!square) return;
  selectSquare(Number(square.dataset.index));
});

function onHandClick(event) {
  const button = event.target.closest(".hand-piece");
  if (!button) return;

  const next = {
    kind: "hand",
    owner: button.dataset.owner,
    type: button.dataset.type,
  };

  if (
    selected?.kind === "hand" &&
    selected.owner === next.owner &&
    selected.type === next.type
  ) {
    selected = null;
  } else {
    selected = next;
  }

  renderBoard();
}

senteHandEl.addEventListener("click", onHandClick);
goteHandEl.addEventListener("click", onHandClick);

let drag = null;
let dragGhost = null;

function createDragGhost(piece, x, y) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = pieceLabel(piece);
  if (piece.promoted) ghost.style.color = "#a1261e";
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
  document.body.append(ghost);
  return ghost;
}

boardEl.addEventListener("pointerdown", (event) => {
  const pieceEl = event.target.closest(".piece");
  if (!pieceEl || event.button !== 0) return;

  const index = Number(pieceEl.dataset.index);
  drag = {
    pointerId: event.pointerId,
    index,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    pieceEl,
  };
  boardEl.setPointerCapture(event.pointerId);
});

boardEl.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;

  const distance = Math.hypot(
    event.clientX - drag.startX,
    event.clientY - drag.startY,
  );

  if (!drag.moved && distance > 8) {
    drag.moved = true;
    drag.pieceEl.classList.add("dragging");
    dragGhost = createDragGhost(game.board[drag.index], event.clientX, event.clientY);
  }

  if (drag.moved && dragGhost) {
    dragGhost.style.left = `${event.clientX}px`;
    dragGhost.style.top = `${event.clientY}px`;
  }
});

function finishBoardDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;

  const current = drag;
  drag = null;

  if (boardEl.hasPointerCapture(event.pointerId)) {
    boardEl.releasePointerCapture(event.pointerId);
  }

  current.pieceEl?.classList.remove("dragging");
  dragGhost?.remove();
  dragGhost = null;

  if (!current.moved) return;

  suppressClick = true;
  window.setTimeout(() => {
    suppressClick = false;
  }, 0);

  const target = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest(".square");

  if (target) {
    attemptBoardMove(current.index, Number(target.dataset.index));
  } else {
    renderBoard();
  }
}

boardEl.addEventListener("pointerup", finishBoardDrag);
boardEl.addEventListener("pointercancel", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.pieceEl?.classList.remove("dragging");
  dragGhost?.remove();
  dragGhost = null;
  drag = null;
  renderBoard();
});

promoteYes.addEventListener("click", () => {
  if (!pendingPromotion) return;
  const piece = game.board[pendingPromotion.to];
  if (piece && PROMOTABLE.has(piece.type)) {
    piece.promoted = true;
  }
  clearPromotionPrompt();
  renderBoard();
});

promoteNo.addEventListener("click", () => {
  clearPromotionPrompt();
  renderBoard();
});

undoButton.addEventListener("click", () => {
  if (!history.length) return;
  future.push(snapshot());
  game = history.pop();
  selected = null;
  clearPromotionPrompt();
  renderBoard();
});

redoButton.addEventListener("click", () => {
  if (!future.length) return;
  history.push(snapshot());
  game = future.pop();
  selected = null;
  clearPromotionPrompt();
  renderBoard();
});

flipButton.addEventListener("click", () => {
  game.flipped = !game.flipped;
  selected = null;
  renderBoard();
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("初期局面に戻しますか？")) return;
  pushHistory();
  game.board = createInitialBoard();
  game.hands = emptyHands();
  game.lastMove = null;
  selected = null;
  clearPromotionPrompt();
  renderBoard();
});

function sizeBoard() {
  const wrap = boardEl.parentElement;
  if (!wrap) return;
  const size = Math.max(160, Math.min(wrap.clientWidth, wrap.clientHeight));
  boardEl.style.width = `${size}px`;
}

const resizeObserver = new ResizeObserver(() => {
  sizeBoard();
  queuePdfRender();
});

resizeObserver.observe(readerPanel);
resizeObserver.observe(boardPanel);

window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    sizeBoard();
    queuePdfRender();
  }, 200);
});

loadBoardState();
renderBoard();
sizeBoard();
updatePdfControls();
