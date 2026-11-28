/**
 * اختبارات محرك Magicly Chess ♟️ — قواعد اللعبة الأساسية.
 *   - الوضع الابتدائي: ٢٠ نقلة قانونية و٣٢ قطعة.
 *   - كش مات (مات المجنون) بالترتيب الحقيقي للنقلات.
 *   - حصر (stalemate) في وضعية معروفة.
 *   - التبييت (قصير وطويل) بشروطه.
 *   - الأخذ بالتجاوز.
 *   - الترقية.
 *   - الـ AI بيخرج نقلة قانونية وبياكل قطعة معلّقة.
 */
import { describe, it, expect } from "vitest";
import {
  initialGame, legalMoves, makeMove, status, isAttacked, sqName,
  type GameState, type Move,
} from "@/lib/games/chess/engine";
import { chooseAiMove, evaluate } from "@/lib/games/chess/ai";

/** بيدور على النقلة من/إلى بالاسم (مثل e2→e4) وبيطبقها */
function play(state: GameState, from: string, to: string, promo?: Move["promo"]): GameState {
  const find = (name: string) => {
    const file = name.charCodeAt(0) - 97;
    const rank = 8 - Number(name[1]);
    return rank * 8 + file;
  };
  const move = legalMoves(state).find(
    (m) => m.from === find(from) && m.to === find(to) && (!promo || m.promo === promo),
  );
  if (!move) throw new Error(`نقلة غير قانونية: ${from}→${to}`);
  return makeMove(state, move);
}

function customGame(
  setup: Record<string, string>,
  turn: "w" | "b" = "b",
  castlingOn = false,
): GameState {
  const board: GameState["board"] = new Array(64).fill(null);
  for (const [name, code] of Object.entries(setup)) {
    const file = name.charCodeAt(0) - 97;
    const rank = 8 - Number(name[1]);
    board[rank * 8 + file] = { t: code[0] as never, c: code[1] as "w" | "b" };
  }
  return {
    board, turn,
    castling: { wK: castlingOn, wQ: castlingOn, bK: castlingOn, bQ: castlingOn },
    ep: null,
  };
}

describe("الوضع الابتدائي", () => {
  it("٢٠ نقلة قانونية و٣٢ قطعة", () => {
    const g = initialGame();
    expect(legalMoves(g)).toHaveLength(20);
    expect(g.board.filter(Boolean)).toHaveLength(32);
    expect(status(g)).toBe("playing");
  });
});

describe("كش مات — مات المجنون", () => {
  it("1.f3 e5 2.g4 Qh4#", () => {
    let g = initialGame();
    g = play(g, "f2", "f3");
    g = play(g, "e7", "e5");
    g = play(g, "g2", "g4");
    g = play(g, "d8", "h4");
    expect(status(g)).toBe("checkmate");
  });

  it("قبلها الوضع كان كش مش مات", () => {
    let g = initialGame();
    g = play(g, "f2", "f3");
    g = play(g, "e7", "e5");
    g = play(g, "g2", "g4");
    expect(status(g)).not.toBe("checkmate");
  });
});

describe("الحصر — stalemate", () => {
  it("ملك أسود a8 ضد ملك وملكة أبيض: لا نقلة ولا كش", () => {
    const g = customGame({ a8: "kb", b6: "kw", c7: "qw" }, "b");
    expect(status(g)).toBe("stalemate");
    expect(legalMoves(g)).toHaveLength(0);
  });
});

describe("التبييت", () => {
  it("قصير وطويل متاح بعد تفريغ المربعات", () => {
    const g = customGame({ e1: "kw", a1: "rw", h1: "rw", e8: "kb" }, "w", true);
    const castleMoves = legalMoves(g).filter((m) => m.flag === "castle");
    expect(castleMoves.map((m) => sqName(m.to)).sort()).toEqual(["c1", "g1"]);
  });

  it("ممنوع لو المربعات بينه وبين الرخ مش فاضية أو مهاومة", () => {
    const g = customGame(
      { e1: "kw", a1: "rw", h1: "rw", e8: "kb", f8: "rb" },
      "w",
      true,
    );
    // f8 رخ أسود بيهدد f1 ⇒ التبييت القصير ممنوع
    expect(legalMoves(g).some((m) => m.flag === "castle" && m.to === 62)).toBe(false);
    expect(legalMoves(g).some((m) => m.flag === "castle" && m.to === 58)).toBe(true);
  });
});

describe("الأخذ بالتجاوز — en passant", () => {
  it("بيدق أبيض e5 ياكل d5 بعد d7d5", () => {
    let g = customGame({ e5: "pw", d7: "pb", e1: "kw", e8: "kb" }, "b");
    g = play(g, "d7", "d5"); // نقلة مزدوجة ⇒ مربع التجاوز d6
    expect(g.ep).toBe((8 - 6) * 8 + 3); // d6 = 43
    const ep = legalMoves(g).find((m) => m.flag === "ep");
    expect(ep).toBeDefined();
    const next = makeMove(g, ep!);
    // البيض الأسود d5 اختفى
    expect(next.board[3 * 8 + 3]).toBeNull();
    // البيدق الأبيض واقف في d6
    expect(next.board[2 * 8 + 3]).toEqual({ t: "p", c: "w" });
  });
});

describe("الترقية", () => {
  it("بيدق أبيض في a7 يولّد ٤ نقلات ترقية لـ a8", () => {
    const g = customGame({ a7: "pw", e1: "kw", e8: "kb" }, "w");
    const promos = legalMoves(g).filter((m) => m.promo);
    expect(promos).toHaveLength(4);
    expect(promos.map((m) => m.promo).sort()).toEqual(["b", "n", "q", "r"]);
  });
});

describe("الـ AI", () => {
  it("بياكل قطعة معلّقة (رخ أسود في d8 ضد ملكة أبيض في d5)", () => {
    // الرخ بيمشي في ملف d الفاضي وياكل الملكة — أكبر مكسب بفارق ٩٠٠
    const g = customGame(
      { d8: "rb", d5: "qw", e1: "kw", e8: "kb" },
      "b",
    );
    const move = chooseAiMove(g, 2);
    expect(move).not.toBeNull();
    expect(sqName(move!.to)).toBe("d5");
  });

  it("نقلته دايمًا قانونية", () => {
    const g = initialGame();
    const move = chooseAiMove(g, 2);
    expect(move).not.toBeNull();
    expect(legalMoves(g)).toContainEqual(move);
  });

  it("التقييم بيحسب المادة بالاتجاهين", () => {
    expect(evaluate(initialGame())).toBe(0);
    const up = customGame({ d4: "qw" }, "w");
    const down = customGame({ d4: "qb" }, "w");
    expect(evaluate(up)).toBe(-evaluate(down));
  });
});
