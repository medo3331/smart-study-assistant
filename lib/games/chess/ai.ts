/**
 * Magic Chess AI — محرك اللعب ضد الكمبيوتر.
 *
 * minimax + alpha-beta مع **تعميق تدريجي محكوم بميزانية وقت** — فالمستويات
 * العالية (ماستر/محترف) بتاخد وقت أطول بس ما بتعلقش الواجهة أبدًا.
 *
 * ٨ مستويات (Beginner → Grandmaster) + ٥ شخصيات لعب بتغيّر أسلوب الـ AI
 * من غير ما تغيّر القوة — زي ما الـ Master Spec (د5/د7) حدد.
 *
 * pure — بدون أي React أو شبكة، وبيقرأ نفس أنواع engine.ts.
 */
import {
  type GameState, type Move, type Piece, type PieceType,
  PIECE_VALUES, legalMoves, makeMove, inCheck, isAttacked,
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
  // من منظور الأبيض (+) — الأبيض هو اللاعب دايمًا في Magic Chess
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

/* ------------------------------------------------------------------ */
/* المستويات — ٨ مستويات: قوة + ضجيج + ميزانية وقت لكل مستوى           */
/* ------------------------------------------------------------------ */

export type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const AI_LEVELS: Record<
  Difficulty,
  { depth: number; jitter: number; budget: number; label: string; desc: string }
> = {
  1: { depth: 1, jitter: 90, budget: 200, label: "مبتدئ", desc: "أخطاء واضحة — مثالي للتعلّم" },
  2: { depth: 1, jitter: 30, budget: 300, label: "سهل", desc: "بيسيب فرص قدامك" },
  3: { depth: 2, jitter: 15, budget: 500, label: "عادي", desc: "لاعب عادي بقرارات معقولة" },
  4: { depth: 2, jitter: 0, budget: 700, label: "متوسط", desc: "يفهم التكتيكات البسيطة" },
  5: { depth: 3, jitter: 0, budget: 1000, label: "متقدم", desc: "بيخطط ويستغل الأخطاء" },
  6: { depth: 3, jitter: 0, budget: 1600, label: "خبير", desc: "بيحسب كذا نقلة قدام" },
  7: { depth: 4, jitter: 0, budget: 2200, label: "ماستر", desc: "قوي جدًا — بيعاقب أي غلطة" },
  8: { depth: 4, jitter: 0, budget: 3000, label: "محترف ♛", desc: "منافسة حقيقية — خُد وقتك" },
};

/* ------------------------------------------------------------------ */
/* الشخصيات — أسلوب لعب مختلف بنفس القوة                               */
/* ------------------------------------------------------------------ */

export type Personality = "default" | "aggressive" | "defensive" | "strategic" | "tactical" | "random";

export const AI_PERSONALITIES: readonly { id: Personality; label: string; emoji: string; desc: string }[] = [
  { id: "default", label: "متوازن", emoji: "⚖️", desc: "يلعب بأسلوبه الطبيعي" },
  { id: "aggressive", label: "هجومي", emoji: "⚔️", desc: "بيحب الهجوم والتضحيات" },
  { id: "defensive", label: "دفاعي", emoji: "🛡️", desc: "بيحافظ على الملك والقطع" },
  { id: "strategic", label: "استراتيجي", emoji: "🎯", desc: "بسيطر على المركز" },
  { id: "tactical", label: "تكتيكي", emoji: "🪤", desc: "بيدور على الفخاخ والكش" },
  { id: "random", label: "عشوائي", emoji: "🎲", desc: "أسلوب غير متوقع" },
] as const;

/**
 * تعديل شخصية اللاعب على قيمة نقلة من منظور الـ AI (الأسود — الأقل أفضل):
 *   تشجيع نقلة = تقليل القيمة · عقاب نقلة = زيادة القيمة
 */
function personalityAdjust(
  state: GameState,
  move: Move,
  next: GameState,
  personality: Personality,
  movedPiece: Piece,
): number {
  const victim = state.board[move.to];
  const givesCheck = inCheck(next, "w"); // الـ AI بيلعب ضد الأبيض
  switch (personality) {
    case "aggressive":
      return (victim ? -20 : 0) + (givesCheck ? -20 : 0);
    case "defensive":
      // القطعة اللي هتفضل معلّقة بعد النقلة = عقاب
      return !victim && !isAttacked(state.board, move.to, "w") && isAttacked(next.board, move.to, "w")
        ? 45 : 0;
    case "strategic":
      return -centerBonus(movedPiece, move.to) * 2; // السحب للوسط
    case "tactical":
      return (givesCheck ? -30 : 0) + (victim ? -10 : 0);
    case "random":
      return (Math.random() * 2 - 1) * 120;
    default:
      return 0;
  }
}

/** أحسن نقلة للأسود (الـ AI دايمًا بيلعب الأسود ضد اللاعب الأبيض) */
export function chooseAiMove(
  state: GameState,
  difficulty: Difficulty,
  personality: Personality = "default",
): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  const { depth, jitter, budget } = AI_LEVELS[difficulty];
  const ordered = orderMoves(state, moves);

  // ضجيج ثابت لكل نقلة — عشان التعميق التدريجي مابيقلبش الترتيب
  const noise = ordered.map(() => (jitter ? (Math.random() * 2 - 1) * jitter : 0));
  const deadline = Date.now() + budget;

  let best: Move | null = ordered[0];
  for (let d = 1; d <= depth; d++) {
    let bestValue = Infinity; // الأسود بيقلّل قيمة الأبيض
    let bestThis: Move | null = null;
    let completed = true;
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const next = makeMove(state, m);
      const movedPiece = state.board[m.from]!;
      const value =
        search(next, d - 1, -Infinity, Infinity)
        + noise[i]
        + personalityAdjust(state, m, next, personality, movedPiece);
      if (value < bestValue) {
        bestValue = value;
        bestThis = m;
      }
      if (Date.now() > deadline) { completed = false; break; }
    }
    if (bestThis && (completed || d === 1)) best = bestThis;
    if (!completed) break; // خلص الوقت — آخر عمق مكمل هو الأفضل المتاح
  }
  return best;
}
