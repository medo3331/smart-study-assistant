"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell, DataNotice } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import {
  initialGame, legalMoves, makeMove, status, glyphOf, sqName,
  type GameState, type Move, type Piece,
} from "@/lib/games/chess/engine";
import { chooseAiMove, type Difficulty } from "@/lib/games/chess/ai";

/**
 * Magicly Chess ♟️ — أول لعبة حقيقية في Magicly Arcade.
 *
 * اللاعب أبيض، الـ AI أسود (minimax بالعمق حسب الصعوبة). النتيجة بتنزل
 * للسيرفر عبر `arcade_submit_score` (db/124) — السيرفر هو اللي بيحسب
 * الـ XP والمكافآت: فوز/يوم = ٥ كوين + إنجازات أول مرة.
 */

type SubmitResult = { xp: number; level: number; best: number; is_record: boolean; coins: number; achievements: string[]; message: string };

const GLYPH_COLOR: Record<"w" | "b", string> = {
  w: "text-ink drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]",
  b: "text-[#3a3a3a] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]",
};

export default function ChessPage() {
  const { supabase, session } = useAuthUser();
  const [game, setGame] = useState<GameState>(() => initialGame());
  const [selected, setSelected] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(2);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [finished, setFinished] = useState(false);
  const submitted = useRef(false);

  const moves = useMemo(() => legalMoves(game), [game]);
  const st = useMemo(() => status(game), [game]);
  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((m) => m.from === selected)),
    [moves, selected],
  );

  // تسجيل النتيجة مرة واحدة عند نهاية المباراة — السيرفر بيحسب المكافآت
  const finish = useCallback(async (finalState: GameState, playerWon: boolean) => {
    if (submitted.current) return;
    submitted.current = true;
    setFinished(true);
    if (!supabase || session.status !== "ready") return;
    // نتيجة الجولة: مادة اللاعب المتبقية + مكافأة فوز
    const material = finalState.board.reduce(
      (sum, p) => sum + (p && p.c === "w"
        ? { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[p.t]
        : 0),
      0,
    );
    const score = playerWon ? 100 + material * 10 : material * 10;
    const { data, error } = await supabase.rpc("arcade_submit_score", {
      p_game: "chess", p_score: score, p_won: playerWon,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) setNote(error.message);
    else if (row) setResult(row as SubmitResult);
  }, [supabase, session.status]);

  // نهاية المباراة — مات أو حصر
  useEffect(() => {
    if (st === "checkmate") void finish(game, game.turn === "b"); // دوره الأسود وهو مات ⇒ اللاعب كسب
    else if (st === "stalemate") void finish(game, false);
  }, [st, game, finish]);

  const aiTurn = useCallback(() => {
    setThinking(true);
    // setTimeout عشان الواجهة ترسم قبل ما البحث ياخد وقته
    window.setTimeout(() => {
      setGame((current) => {
        const move = chooseAiMove(current, difficulty);
        if (move) return makeMove(current, move);
        return current;
      });
      setThinking(false);
    }, 350);
  }, [difficulty]);

  const onSquare = (sq: number) => {
    if (thinking || finished || game.turn !== "w") return;
    const piece: Piece | null = game.board[sq];
    if (selected !== null) {
      const move = targets.find((m) => m.to === sq);
      if (move) {
        // الترقية — الواجهة بتختار الملكة (أعلى قيمة)
        const promo = move.promo ? { ...move, promo: "q" as const } : move;
        const next = makeMove(game, promo);
        setSelected(null);
        setGame(next);
        if (status(next) === "playing") aiTurn();
        return;
      }
    }
    setSelected(piece && piece.c === "w" ? sq : null);
  };

  const restart = () => {
    submitted.current = false;
    setGame(initialGame());
    setSelected(null);
    setResult(null);
    setFinished(false);
    setNote("");
  };

  const lastRow = 8 - 1;

  return (
    <PageShell
      eyebrow="Magicly Chess"
      title="♟️ شطرنج ماجِك"
      lede="اللعب ضد الكمبيوتر — كل فوز بيكسبك XP وأول فوز في اليوم بيكسب 5 Coins."
      action={<button className="btn btn-quiet text-sm" onClick={restart}>مباراة جديدة</button>}
    >
      {note && <DataNotice message={note} />}

      {/* الإعدادات والحالة */}
      <div className="flex flex-wrap items-center gap-2">
        {([1, 2, 3] as Difficulty[]).map((d) => (
          <button
            key={d}
            className={`btn text-sm ${difficulty === d ? "btn-marker" : "btn-quiet"}`}
            onClick={() => setDifficulty(d)}
          >
            {d === 1 ? "سهل" : d === 2 ? "متوسط" : "صعب"}
          </button>
        ))}
        <span className="tag">
          {finished
            ? st === "checkmate" ? "🎉 كش مات — كسبت!" : "🤝 تعادل بالحصر"
            : st === "checkmate" ? "💀 خسرت — كش مات"
            : st === "check" ? (game.turn === "w" ? "⚠️ ملكك في كش!" : "كش على الكمبيوتر")
            : game.turn === "w" ? "دورك — أنت الأبيض" : thinking ? "الكمبيوتر بيفكر…" : "دور الكمبيوتر"}
        </span>
      </div>

      {/* نتيجة المباراة */}
      {result && (
        <section className="sheet-card space-y-2 p-5">
          <h2 className="h3">{result.is_record ? "🎉 رقم قياسي جديد!" : "نتيجة المباراة"}</h2>
          <p className="text-sm">
            <strong>+{result.xp} XP</strong> · مستوى Arcade {result.level}
            {result.coins > 0 && <> · <strong>+{result.coins} 🪙</strong></>}
          </p>
          {result.achievements?.length > 0 && (
            <p className="text-sm font-bold text-marker">🏅 إنجازات جديدة: {result.achievements.length}</p>
          )}
          <p className="text-xs text-ink-soft">{result.message}</p>
        </section>
      )}

      {/* اللوحة */}
      <div className="mx-auto w-full max-w-md" dir="ltr">
        <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl border-2 border-rule shadow-sm select-none">
          {game.board.map((piece, sq) => {
            const r = Math.floor(sq / 8), f = sq % 8;
            const dark = (r + f) % 2 === 1;
            const isTarget = targets.some((m) => m.to === sq);
            const isSel = selected === sq;
            const capture = isTarget && piece !== null;
            return (
              <button
                key={sq}
                onClick={() => onSquare(sq)}
                className={`relative flex items-center justify-center text-3xl leading-none sm:text-4xl ${
                  dark ? "bg-[#b58863]" : "bg-[#f0d9b5]"
                } ${isSel ? "ring-2 ring-inset ring-marker" : ""}`}
                aria-label={`${sqName(sq)}${piece ? ` ${piece.c === "w" ? "أبيض" : "أسود"}` : ""}`}
              >
                {piece && <span className={GLYPH_COLOR[piece.c]}>{glyphOf(piece)}</span>}
                {isTarget && (
                  <span className={`absolute ${capture ? "inset-1 rounded-full border-4 border-marker/70" : "h-3 w-3 rounded-full bg-marker/60"}`} />
                )}
                {f === 0 && <span className="absolute left-0.5 top-0 text-[9px] text-ink-soft/70">{8 - r}</span>}
                {r === lastRow && <span className="absolute bottom-0 right-0.5 text-[9px] text-ink-soft/70">{"abcdefgh"[f]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-ink-soft">
        دوس على قطعة من قطعك الأبيض واختار المربع الأخضر — الدايرة الكبيرة معناها أكل. التبييت بيحصل لما تحرك الملك مربعين.
      </p>
    </PageShell>
  );
}
