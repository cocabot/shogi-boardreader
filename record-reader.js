import {importKIF, importKI2, importCSA, Square, Move, Color, pieceTypeToSFEN,
  getBlackPlayerName, getWhitePlayerName} from 'tsshogi';

export function decodeRecord(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text;
  if (data[0] === 0xff && data[1] === 0xfe) text = new TextDecoder('utf-16le', {fatal:true}).decode(data);
  else if (data[0] === 0xfe && data[1] === 0xff) text = new TextDecoder('utf-16be', {fatal:true}).decode(data);
  else {
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(data); }
    catch { text = new TextDecoder('shift_jis', {fatal:true}).decode(data); }
  }
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function parseRecord(bytes, filename) {
  const text = decodeRecord(bytes);
  const extension = filename.split('.').pop().toLowerCase();
  const parser = {kif:importKIF, kifu:importKIF, ki2:importKI2, ki2u:importKI2, csa:importCSA}[extension];
  if (!parser) throw new Error('対応形式は .kif / .ki2 / .csa（.kifu / .ki2u も可）です。');
  if (!text.trim()) throw new Error('棋譜が空です。');
  if (extension === 'csa' && /^\/\s*$/m.test(text)) {
    throw new Error('複数対局を含むCSAです。1対局ずつのファイルに分けてください。');
  }
  // Parsers allow metadata-only input. Reject unrelated text rather than showing a fake initial game.
  if (!/(手合割[：:]|先手[：:]|後手[：:]|[1-9０-９][一二三四五六七八九]|[▲△☗☖]|^P[I1-9+-]|^[+-]\d{4}[A-Z]{2}|^\|)/m.test(text)) {
    throw new Error('棋譜の内容を認識できません。ファイル形式と文字コードをご確認ください。');
  }
  const record = parser(text);
  if (record instanceof Error) throw new Error(`棋譜を解析できませんでした: ${record.message}`);
  record.goto(0);
  return record;
}

export const boardIndex = (square) => (square.rank - 1) * 9 + 9 - square.file;
export function recordGame(record, flipped = false) {
  const position = record.position;
  const board = Array.from({length:81}, (_,i) => {
    const piece = position.board.at(new Square(9-i%9, Math.floor(i/9)+1));
    if (!piece) return null;
    const sfen = pieceTypeToSFEN(piece.type);
    return {type:sfen.at(-1), promoted:sfen.startsWith('+'), owner:piece.color === Color.BLACK?'b':'w'};
  });
  const hands = {b:{},w:{}};
  for (const [owner,hand] of [['b',position.blackHand],['w',position.whiteHand]]) {
    hand.forEach((type,n) => { hands[owner][pieceTypeToSFEN(type)] = n; });
  }
  const move = record.current.move;
  return {board, hands, flipped, turn:position.color===Color.BLACK?'b':'w', lastMove:move instanceof Move ? {
    from:move.from instanceof Square ? boardIndex(move.from) : null, to:boardIndex(move.to),
  } : null};
}
export function playerNames(record) {
  return {b:getBlackPlayerName(record.metadata) || '先手', w:getWhitePlayerName(record.metadata) || '後手'};
}
