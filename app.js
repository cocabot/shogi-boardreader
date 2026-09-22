import { setupPdfReader } from "./pdf-reader.js";
import { parseRecord, recordGame, playerNames } from "./record-reader.js";

const $ = (selector) => document.querySelector(selector);

const app = $("#app");
const readerPanel = $("#readerPanel");
const boardPanel = $("#boardPanel");
const splitter = $("#splitter");
const splitHalf = $("#splitHalf");

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

const queuePdfRender = setupPdfReader();
const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing/full storage must not break the app. */ } },
};
let record = null;
let playback = false;
let recordLoadID = 0;
let names = {b:'先手',w:'後手'};

function setReaderRatio(ratio) {
  const padding = getComputedStyle(app);
  const available = app.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
  const minBoardPanel = available < 600 ? 250 : 300;
  const maxRatio = Math.max(.2, Math.min(.7, (available - minBoardPanel - 16) / available));
  const clamped = Math.max(0.2, Math.min(maxRatio, ratio));
  document.documentElement.style.setProperty("--reader-ratio", clamped.toFixed(3));
  safeStorage.set("shogi-boardreader:split", String(clamped));
  splitter.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
  queuePdfRender();
  sizeBoard();
}

const savedRatio = Number(safeStorage.get("shogi-boardreader:split"));
setReaderRatio(Number.isFinite(savedRatio) && savedRatio >= 0.42 && savedRatio <= 0.58 ? savedRatio : 0.50);

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
splitHalf.addEventListener("click", () => {
  setReaderRatio(0.50);
  $('#boardMenuDialog')?.close();
});

splitter.addEventListener('keydown', (event) => {
  if (!['ArrowUp','ArrowDown','Home'].includes(event.key)) return;
  event.preventDefault();
  const current = Number(splitter.getAttribute('aria-valuenow')) / 100;
  setReaderRatio(event.key === 'Home' ? .5 : current + (event.key === 'ArrowUp' ? -.04 : .04));
});

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
    const saved = JSON.parse(safeStorage.get("shogi-boardreader:board") || "null");
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
  if (!playback) safeStorage.set("shogi-boardreader:board", JSON.stringify(game));
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
  $('#fileLabels').replaceChildren(...Array.from({length:9}, (_, i) => {
    const el = document.createElement('span'); el.textContent = game.flipped ? i+1 : 9-i; return el;
  }));
  $('#rankLabels').replaceChildren(...Array.from({length:9}, (_, i) => {
    const el = document.createElement('span'); el.textContent = '一二三四五六七八九'[game.flipped ? 8-i : i]; return el;
  }));

  for (let displayRow = 0; displayRow < 9; displayRow += 1) {
    for (let displayCol = 0; displayCol < 9; displayCol += 1) {
      const index = modelIndexFromDisplay(displayRow, displayCol);
      const square = document.createElement("div");
      square.className = "square";
      square.dataset.index = String(index);
      square.setAttribute("role", "gridcell");
      square.tabIndex = 0;
      square.setAttribute('aria-selected', String(selected?.kind === 'board' && selected.index === index));
      const occupant = game.board[index];
      square.setAttribute('aria-label', `${9-index%9}${'一二三四五六七八九'[Math.floor(index/9)]} ${occupant ? (occupant.owner==='b'?'先手 ':'後手 ')+pieceLabel(occupant) : '空きマス'}`);

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
        const glyph = document.createElement('span');
        glyph.textContent = pieceLabel(piece);
        pieceEl.append(glyph);
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
  undoButton.disabled = playback || history.length === 0;
  redoButton.disabled = playback || future.length === 0;
  resetButton.disabled = playback;
  flipButton.textContent = game.flipped ? "⇅ 先手側" : "⇅ 反転";
  saveBoardState();
}

function renderHands() {
  renderHand(game.flipped ? "b" : "w", goteHandEl);
  renderHand(game.flipped ? "w" : "b", senteHandEl);
}

function renderHand(owner, container) {
  container.replaceChildren();

  const sideLabel = document.createElement("span");
  sideLabel.className = "hand-side";
  const side = owner === 'b' ? '先手' : '後手';
  sideLabel.textContent = `${owner === 'b' ? '▲' : '△'} ${playback ? names[owner] : side}`;
  sideLabel.title = sideLabel.textContent;
  if (playback && game.turn === owner) sideLabel.classList.add('active');
  container.setAttribute('aria-label', `${side}の持ち駒`);
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
    button.textContent = PIECE_LABEL[type];
    const badge = document.createElement('small'); badge.textContent = count; button.append(badge);
    button.setAttribute('aria-label', `${side}の持ち駒 ${PIECE_LABEL[type]} ${count}枚`);
    button.disabled = playback;
    container.append(button);
  }

  if (!HAND_ORDER.some((type) => game.hands[owner][type] > 0)) {
    const empty = document.createElement("span");
    empty.textContent = "持駒なし";
    empty.className = "empty-hand";
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
  if (playback) return;
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

  if (target && target.type !== "K") {
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
  if (playback) return;
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
  if (playback) return;
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
  if (playback) return;
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
  if (playback) return;
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
  const frame = boardEl.parentElement, wrap = frame.parentElement;
  const style = getComputedStyle(frame);
  const dx = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
  const dy = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
  const size = Math.max(0, Math.floor(Math.min(wrap.clientWidth-dx, wrap.clientHeight-dy, 480)));
  boardEl.style.setProperty('--board-pixels', `${size}px`);
  boardEl.style.setProperty('--piece-size', `${Math.max(0, (size-2)/9 * .57)}px`);
}

const resizeObserver = new ResizeObserver(() => {
  sizeBoard();
  queuePdfRender();
});

resizeObserver.observe(readerPanel);
resizeObserver.observe(boardPanel);
window.addEventListener('resize', () => setReaderRatio(Number(splitter.getAttribute('aria-valuenow'))/100));

window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    sizeBoard();
    queuePdfRender();
  }, 200);
});

loadBoardState();
renderBoard();
sizeBoard();



boardEl.addEventListener('keydown', (event) => {
  const cell = event.target.closest('.square');
  if (!cell) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); const index = cell.dataset.index;
    selectSquare(Number(index)); boardEl.querySelector(`[data-index="${index}"]`)?.focus();
  }
});

function updatePlayback() {
  const ply = record?.current.ply ?? 0;
  $('.playback').hidden = !record;
  $('#moveCount').textContent = record && playback ? `${ply} / ${record.length} 手` : '自由盤';
  for (const id of ['firstMove','prevMove']) $("#"+id).disabled = !record || (playback && ply === 0);
  for (const id of ['lastMove','nextMove']) $("#"+id).disabled = !record || (playback && ply === record.length);
  $('#recordListButton').disabled = !record;
  $('#boardMode').textContent = playback ? `${game.turn==='b'?'▲ 先手':'△ 後手'}の手番` : record ? '検討中' : '自由盤';
  $('#studyPosition').hidden = !playback;
  $('#resumeRecord').hidden = playback;
}
function showRecordPosition() {
  playback = true;
  game = recordGame(record, game.flipped);
  selected = null; clearPromotionPrompt();
  renderBoard(); updatePlayback();
}
function navigateRecord(ply) {
  if (!record) return;
  record.goto(ply); showRecordPosition();
}
$('#firstMove').onclick = () => navigateRecord(0);
$('#prevMove').onclick = () => navigateRecord(record.current.ply-1);
$('#nextMove').onclick = () => navigateRecord(record.current.ply+1);
$('#lastMove').onclick = () => navigateRecord(record.length);
$('#recordFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  const id = ++recordLoadID;
  try {
    if (file.size > 5*1024*1024) throw new Error('棋譜は5MB以下のファイルを選択してください。');
    const bytes = await file.arrayBuffer();
    if (id !== recordLoadID) return;
    const parsed = parseRecord(bytes, file.name);
    record = parsed; names = playerNames(record);
    history = []; future = [];
    $('#recordName').textContent = file.name;
    showRecordPosition();
  } catch (error) {
    if (id !== recordLoadID) return;
    $('#messageText').textContent = error.message;
    $('#messageDialog').showModal();
  }
});
$('#closeMessage').onclick = () => $('#messageDialog').close();
$('#boardMenuButton').onclick = () => $('#boardMenuDialog').showModal();
$('#closeBoardMenu').onclick = () => $('#boardMenuDialog').close();
$('#boardMenuDialog').addEventListener('click', (event) => {
  const dialog = $('#boardMenuDialog');
  if (event.target === dialog) {
    dialog.close();
    return;
  }
  if (event.target.closest('button') && event.target.id !== 'closeBoardMenu') {
    queueMicrotask(() => { if (dialog.open) dialog.close(); });
  }
});

function renderRecordList() {
  const list = $('#moveList'); list.replaceChildren();
  $('#recordMessage').textContent = record.current.comment || `${record.current.ply}手目 · ${record.current.displayText}`;
  for (const node of record.moves) {
    const row = document.createElement('li');
    const jump = document.createElement('button'); jump.className = 'move-jump';
    jump.textContent = `${node.ply}　${node.ply ? node.displayText : '開始局面'}${node.comment ? ' ▤' : ''}`;
    jump.setAttribute('aria-current', String(node === record.current));
    jump.onclick = () => { record.gotoNode(node); showRecordPosition(); $('#recordDialog').close(); };
    row.append(jump);
    const first = node.prev?.next;
    if (first?.branch) {
      const choices = document.createElement('select'); choices.setAttribute('aria-label', `${node.ply}手目の変化`);
      for (let branch = first; branch; branch = branch.branch) {
        const option = document.createElement('option'); option.value = branch.branchIndex;
        option.textContent = `${branch.branchIndex ? '変化'+branch.branchIndex : '本譜'}: ${branch.displayText}`;
        option.selected = branch === node; choices.append(option);
      }
      choices.onchange = () => { record.gotoNode(node); record.switchBranchByIndex(Number(choices.value)); showRecordPosition(); renderRecordList(); };
      row.append(choices);
    }
    list.append(row);
  }
}
$('#recordListButton').onclick = () => { renderRecordList(); $('#recordDialog').showModal(); $('#moveList [aria-current="true"]')?.scrollIntoView({block:'nearest'}); };
$('#closeRecord').onclick = () => $('#recordDialog').close();
$('#studyPosition').onclick = () => {
  playback = false; history = []; future = []; selected = null;
  renderBoard(); updatePlayback(); $('#recordDialog').close();
};
$('#resumeRecord').onclick = () => { showRecordPosition(); $('#recordDialog').close(); };
$('#mainLine').onclick = () => { record.goto(0); record.resetAllBranchSelection(); showRecordPosition(); renderRecordList(); };
updatePlayback();
