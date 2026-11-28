/**
 * Magicly Chess AI — minimax مع alpha-beta.
 *
 * مستويات الصعوبة = عمق البحث (سهل ١ · متوسط ٢ · صعب ٣) + ضجيج عشوائي
 * بسيط في المستوى السهل عشان مش كل مرة نفس النقلة. التقييم: مادة
 * (PIECE_VALUES) + مكافأة مركزية صغيرة للبيادق والفرسان.
 *
 * pure — بدون أي React أو شبكة، وبيقرأ نفس أنواع engine.ts.
 */
import {
  type GameState, type Move, type Piece,
  PIECE_VALUES, legalMoves, makeMove, inCheck,
} from "./engine";

const CENTER_BONUS: Record<string, number> = { p: 6, n: 12 };
function centerBonus(p: Piece, sq: number): number {
  const bonus = CENTER_BONUS[p.t];
  if (!bonus) return 0;
  const r = Math.floor(sq / 8), f = sq % 8;
  const dist = Math.max(Math.abs(2 * r - 7), Math.abs(2 * f - 7)); // 7 في النص، 1 على الحافة
  return Math.round(((8 - dist) / 7) * bonus);
}

export function evaluate(state: GameState): number {
  // من منظور الأبيض (+) — الأبيض هو اللاعب دايمًا في Magicly Chess
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const v = PIECE_VALUES[p.t] + centerBonus(p, sq);
    score += p.c === "w" ? v : -v;
  }
  return score;
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  // الأكل الأول — بيقصّ عناوين alpha-beta بسرعة
  return moves.slice().sort((a, b) => {
    const capA = state.board[a.to] ? PIECE_VALUES[state.board[a.to]!.t] : 0;
    const capB = state.board[b.to] ? PIECE_VALUES[state.board[b.to]!.t] : 0;
    return capB - capA;
  });
}

function search(state: GameState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evaluate(state);
  const moves = legalMoves(state);
  if (moves.length === 0) {
    // مات أو حصر — من منظور اللي عليه الدور
    if (inCheck(state, state.turn)) return state.turn === "w" ? -99999 : 99999;
    return 0;
  }
  const maximizing = state.turn === "w";
  let best = maximizing ? -Infinity : Infinity;
  for (const m of orderMoves(state, moves)) {
    const value = search(makeMove(state, m), depth - 1, alpha, beta);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * ٥ مستويات = (عمق البحث + ضجيج):
 *   مبتدئ · هاوي · متوسط · متقدم · محترف
 * الضجيج بيخلي المستوى الواطي يغلط عمدًا، والمحترف بيقلب بحث أعمق.
 */
export const AI_LEVELS: Record<Difficulty, { depth: number; jitter: number; label: string }> = {
  1: { depth: 1, jitter: 85, label: "مبتدئ" },
  2: { depth: 1, jitter: 25, label: "هاوي" },
  3: { depth: 2, jitter: 10, label: "متوسط" },
  4: { depth: 2, jitter: 0, label: "متقدم" },
  5: { depth: 3, jitter: 0, label: "محترف ♛" },
};

/** أحسن نقلة للأسود (الـ AI دايمًا بيلعب الأسود ضد اللاعب الأبيض) */
export function chooseAiMove(state: GameState, difficulty: Difficulty): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  const { depth, jitter } = AI_LEVELS[difficulty];
  let best: Move | null = null;
  let bestValue = Infinity; // الأسود بيقلّل قيمة الأبيض
  for (const m of orderMoves(state, moves)) {
    const next = makeMove(state, m);
    const value = search(next, depth - 1, -Infinity, Infinity)
      + (jitter ? (Math.random() * 2 - 1) * jitter : 0);
    if (value < bestValue) {
      bestValue = value;
      best = m;
    }
  }
  return best;
}
