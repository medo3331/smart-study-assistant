/**
 * محرك الشطرنج — Magicly Chess ♟️
 *
 * قواعد كاملة: كل حركات القطع، التبييت، الأخذ بالتجاوز (en passant)،
 * الترقية (بيوتلد ٤ اختيارات — الواجهة بتستخدم الملكة)، الكش،
 * كش مات، والتعادل بالحصر (stalemate).
 *
 * التمثيل: لوحة 64 مربع — index = rank*8 + file، وrank 0 هو الصف الثامن
 * (أعلى اللوحة، جهة الأسود) — نفس ترتيب FEN من a8 لـ h1.
 *
 * الملف ده pure TypeScript مفيش أي React — عشان يتاخد اختباراته لوحده
 * (tests/chess-engine.test.ts) ويتنادى من الواجهة ومن الـ AI.
 */

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Piece = { t: PieceType; c: Color };
export type Castling = { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
export type Move = {
  from: number;
  to: number;
  promo?: PieceType;
  /** ep = أخذ بالتجاوز · castle = تبييت · double = نقلة بيدق مزدوجة */
  flag?: "ep" | "castle" | "double";
};
export type GameState = {
  board: (Piece | null)[]; // 64
  turn: Color;
  castling: Castling;
  ep: number | null; // مربع التجاوز المتاح
};

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const sqName = (sq: number) => `${FILES[sq % 8]}${8 - Math.floor(sq / 8)}`;

const PIECE_GLYPH: Record<PieceType, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
/** شكل القطعة — بنستخدم الشكل المصمت ونعكس لونه بالـ CSS حسب c */
export const glyphOf = (p: Piece) => PIECE_GLYPH[p.t];

export const PIECE_VALUES: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** نقلة بيدق مزدوجة بيبتدي منها التجاوز */
const START_RANK: Record<Color, number> = { w: 6, b: 1 };
const PROMO_RANK: Record<Color, number> = { w: 0, b: 7 };

export function initialGame(): GameState {
  const board: (Piece | null)[] = new Array(64).fill(null);
  const back: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let f = 0; f < 8; f++) {
    board[0 * 8 + f] = { t: back[f], c: "b" };
    board[1 * 8 + f] = { t: "p", c: "b" };
    board[6 * 8 + f] = { t: "p", c: "w" };
    board[7 * 8 + f] = { t: back[f], c: "w" };
  }
  return { board, turn: "w", castling: { wK: true, wQ: true, bK: true, bQ: true }, ep: null };
}

/** هل المربع مهاجم بلون معين؟ */
export function isAttacked(board: (Piece | null)[], sq: number, by: Color): boolean {
  const r = Math.floor(sq / 8), f = sq % 8;
  // بيادق — المهاجم بيدق بياكل باتجاه اللاعب (الأسود بينزل → بياكل لفوق بالنسبة للفهرس)
  const pawnRow = by === "w" ? r + 1 : r - 1; // البيدق المهاجم جاي من الصف ده
  for (const df of [-1, 1]) {
    if (pawnRow >= 0 && pawnRow < 8 && f + df >= 0 && f + df < 8) {
      const p = board[pawnRow * 8 + f + df];
      if (p && p.c === by && p.t === "p") return true;
    }
  }
  // فرسان
  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, df] of KNIGHT) {
    const nr = r + dr, nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.c === by && p.t === "n") return true;
    }
  }
  // الملك
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
    if (!dr && !df) continue;
    const nr = r + dr, nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.c === by && p.t === "k") return true;
    }
  }
  // القطع الزاحفة — 8 اتجاهات (قطرية للفيل/الملكة، مستقيمة للرخ/الملكة)
  const SLIDE: [number, number, PieceType][] = [
    [-1, -1, "b"], [-1, 1, "b"], [1, -1, "b"], [1, 1, "b"],
    [-1, 0, "r"], [1, 0, "r"], [0, -1, "r"], [0, 1, "r"],
  ];
  for (const [dr, df, kind] of SLIDE) {
    let nr = r + dr, nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.c === by && (p.t === kind || p.t === "q")) return true;
        break;
      }
      nr += dr; nf += df;
    }
  }
  return false;
}

export function findKing(board: (Piece | null)[], c: Color): number {
  return board.findIndex((p) => p && p.t === "k" && p.c === c);
}

export function inCheck(state: GameState, c: Color): boolean {
  const k = findKing(state.board, c);
  return k >= 0 && isAttacked(state.board, k, c === "w" ? "b" : "w");
}

/** حركات شبه-قانونية لقطعة واحدة (من غير فلترة كش الملك) */
function pseudoMoves(state: GameState, from: number): Move[] {
  const piece = state.board[from];
  if (!piece) return [];
  const r = Math.floor(from / 8), f = from % 8;
  const moves: Move[] = [];
  const push = (to: number, extra?: Partial<Move>) => {
    if (to >= 0 && to < 8 * 8) moves.push({ from, to, ...extra });
  };
  const slide = (dirs: [number, number][]) => {
    for (const [dr, df] of dirs) {
      let nr = r + dr, nf = f + df;
      while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
        const to = nr * 8 + nf;
        const target = state.board[to];
        if (!target) push(to);
        else { if (target.c !== piece.c) push(to); break; }
        nr += dr; nf += df;
      }
    }
  };

  switch (piece.t) {
    case "p": {
      const dir = piece.c === "w" ? -1 : 1;
      const one = (r + dir) * 8 + f;
      if (r + dir >= 0 && r + dir < 8 && !state.board[one]) {
        if (r + dir === PROMO_RANK[piece.c]) for (const promo of ["q", "r", "b", "n"] as PieceType[]) push(one, { promo });
        else push(one);
        const two = (r + 2 * dir) * 8 + f;
        if (r === START_RANK[piece.c] && !state.board[two]) push(two, { flag: "double" });
      }
      for (const df of [-1, 1]) {
        const nr = r + dir, nf = f + df;
        if (nr < 0 || nr >= 8 || nf < 0 || nf >= 8) continue;
        const to = nr * 8 + nf;
        const target = state.board[to];
        if (target && target.c !== piece.c) {
          if (nr === PROMO_RANK[piece.c]) for (const promo of ["q", "r", "b", "n"] as PieceType[]) push(to, { promo });
          else push(to);
        } else if (!target && state.ep === to) {
          push(to, { flag: "ep" });
        }
      }
      break;
    }
    case "n": {
      const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, df] of KNIGHT) {
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const target = state.board[nr * 8 + nf];
          if (!target || target.c !== piece.c) push(nr * 8 + nf);
        }
      }
      break;
    }
    case "b": slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]); break;
    case "r": slide([[-1, 0], [1, 0], [0, -1], [0, 1]]); break;
    case "q": slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]); break;
    case "k": {
      for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
        if (!dr && !df) continue;
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const target = state.board[nr * 8 + nf];
          if (!target || target.c !== piece.c) push(nr * 8 + nf);
        }
      }
      // التبييت — الملك مش في كش، المربعات اللي بيني وبين الرخ فاضية،
      // والمربعات اللي بيعدي عليها مش مهاومة.
      const enemy: Color = piece.c === "w" ? "b" : "w";
      const homeR = piece.c === "w" ? 7 : 0;
      if (from === homeR * 8 + 4 && !isAttacked(state.board, from, enemy)) {
        if (piece.c === "w" ? state.castling.wK : state.castling.bK) {
          const f1 = homeR * 8 + 5, g1 = homeR * 8 + 6;
          const rook = state.board[homeR * 8 + 7];
          if (!state.board[f1] && !state.board[g1]
            && rook && rook.t === "r" && rook.c === piece.c
            && !isAttacked(state.board, f1, enemy) && !isAttacked(state.board, g1, enemy)) {
            push(g1, { flag: "castle" });
          }
        }
        if (piece.c === "w" ? state.castling.wQ : state.castling.bQ) {
          const d1 = homeR * 8 + 3, c1 = homeR * 8 + 2, b1 = homeR * 8 + 1;
          const rook = state.board[homeR * 8 + 0];
          if (!state.board[d1] && !state.board[c1] && !state.board[b1]
            && rook && rook.t === "r" && rook.c === piece.c
            && !isAttacked(state.board, d1, enemy) && !isAttacked(state.board, c1, enemy)) {
            push(c1, { flag: "castle" });
          }
        }
      }
      break;
    }
  }
  return moves;
}

export function makeMove(state: GameState, move: Move): GameState {
  const board = state.board.slice();
  const piece = board[move.from];
  if (!piece) throw new Error(`makeMove: مافيش قطعة في ${sqName(move.from)}`);
  const castling = { ...state.castling };

  // أخذ بالتجاوز — البيدق الماكل بينزل ورا البيضة
  if (move.flag === "ep") {
    const dir = piece.c === "w" ? 1 : -1;
    board[move.to + dir * 8] = null;
  }

  // التبييت — نحرّك الرخ كمان
  if (move.flag === "castle") {
    const homeR = piece.c === "w" ? 7 : 0;
    if (move.to === homeR * 8 + 6) { // قصير
      board[homeR * 8 + 5] = board[homeR * 8 + 7];
      board[homeR * 8 + 7] = null;
    } else { // طويل
      board[homeR * 8 + 3] = board[homeR * 8 + 0];
      board[homeR * 8 + 0] = null;
    }
  }

  board[move.to] = move.promo ? { t: move.promo, c: piece.c } : piece;
  board[move.from] = null;

  // حقوق التبييت — بتفضل عند حركة الملك أو الرخ أو أكل الرخ
  if (piece.t === "k") {
    if (piece.c === "w") { castling.wK = false; castling.wQ = false; }
    else { castling.bK = false; castling.bQ = false; }
  }
  if (move.from === 63 || move.to === 63) castling.wK = false; // h1
  if (move.from === 56 || move.to === 56) castling.wQ = false; // a1
  if (move.from === 7 || move.to === 7) castling.bK = false;  // h8
  if (move.from === 0 || move.to === 0) castling.bQ = false;  // a8

  const ep = move.flag === "double" ? (move.from + move.to) / 2 : null;

  return { board, turn: state.turn === "w" ? "b" : "w", castling, ep };
}

/** الحركات القانونية — شبه-قانونية + الملك ميكشش بعد النقلة */
export function legalMoves(state: GameState): Move[] {
  const out: Move[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p || p.c !== state.turn) continue;
    for (const m of pseudoMoves(state, sq)) {
      const next = makeMove(state, m);
      if (!inCheck(next, state.turn)) out.push(m);
    }
  }
  return out;
}

export type GameStatus = "playing" | "check" | "checkmate" | "stalemate";

export function status(state: GameState): GameStatus {
  const moves = legalMoves(state);
  if (moves.length === 0) return inCheck(state, state.turn) ? "checkmate" : "stalemate";
  return inCheck(state, state.turn) ? "check" : "playing";
}
