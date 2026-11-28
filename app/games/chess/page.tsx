"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell, DataNotice } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import {
  initialGame, legalMoves, makeMove, status, glyphOf, sqName, findKing,
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

/** القطع الممتلئة (solid) — الاتنين نفس الجليف والفرق بالتلوين والحدود */
function pieceStyle(c: "w" | "b"): React.CSSProperties {
  return c === "w"
    ? { color: "#fdfdfb", WebkitTextStroke: "1.5px #3f3f46", textShadow: "0 2px 3px rgba(0,0,0,0.35)" }
    : { color: "#27272a", WebkitTextStroke: "1px #d6d3d1", textShadow: "0 2px 3px rgba(0,0,0,0.25)" };
}

const PIECE_NAMES: Record<string, string> = {
  p: "البيدق — لقّدّة واحدة (أو اتنين من بدايته) ويأكل بالتجاوز",
  n: "الفرس — حركة حرف L ويقدر ينط فوق القطع",
  b: "الفيل — قطرية بس وبملون واحد",
  r: "الرخ — مستقيم طولي وعرضي",
  q: "الملكة — مستقيم وقطرية (أقوى قطعة)",
  k: "الملك — مربع واحد في أي اتجاه، لو اتحاصر = خسارة",
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
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [captured, setCaptured] = useState<{ w: string[]; b: string[] }>({ w: [], b: [] });
  const [history, setHistory] = useState<string[]>([]);
  const submitted = useRef(false);

  const moves = useMemo(() => legalMoves(game), [game]);
  const st = useMemo(() => status(game), [game]);
  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((m) => m.from === selected)),
    [moves, selected],
  );
  // مربع الملك المهدد — إبراز الكش
  const checkedKing = useMemo(
    () => (st === "check" || st === "checkmate" ? findKing(game.board, game.turn) : -1),
    [st, game],
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
        if (move) {
          setLastMove({ from: move.from, to: move.to });
          setCaptured((cap) => {
            const p = current.board[move.to];
            return p ? { ...cap, w: [...cap.w, p.t] } : cap;
          });
          setHistory((h) => [...h.slice(-6), `${sqName(move.from)}→${sqName(move.to)}`]);
          return makeMove(current, move);
        }
        return current;
      });
      setThinking(false);
    }, 250);
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
        setLastMove({ from: move.from, to: move.to });
        setCaptured((cap) => {
          const p = game.board[move.to];
          return p ? { ...cap, b: [...cap.b, p.t] } : cap;
        });
        setHistory((h) => [...h.slice(-6), `${sqName(move.from)}→${sqName(move.to)}`]);
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
    setLastMove(null);
    setCaptured({ w: [], b: [] });
    setHistory([]);
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
        {lastMove && <span className="mono text-xs text-ink-soft" dir="ltr">{sqName(lastMove.from)} → {sqName(lastMove.to)}</span>}
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

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        {/* اللوحة */}
        <div className="mx-auto w-full max-w-lg" dir="ltr">
          <div className="overflow-hidden rounded-2xl border-4 border-[#5d4037] shadow-lg">
            <div className="grid aspect-square w-full grid-cols-8 select-none">
              {game.board.map((piece, sq) => {
                const r = Math.floor(sq / 8), f = sq % 8;
                const dark = (r + f) % 2 === 1;
                const isTarget = targets.some((m) => m.to === sq);
                const isSel = selected === sq;
                const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                const isCheck = checkedKing === sq;
                const capture = isTarget && piece !== null;
                const mine = piece && piece.c === "w" && !finished && game.turn === "w";
                return (
                  <button
                    key={sq}
                    onClick={() => onSquare(sq)}
                    className={`relative flex items-center justify-center transition-colors duration-150 ${
                      dark ? "bg-[#a97c5b]" : "bg-[#e8d0b0]"
                    } ${isLast ? (dark ? "bg-[#bfae6a]" : "bg-[#e5d68e]") : ""} ${
                      isSel ? "ring-[3px] ring-inset ring-marker" : ""
                    } ${mine ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                    aria-label={`${sqName(sq)}${piece ? ` ${piece.c === "w" ? "أبيض" : "أسود"}` : ""}`}
                  >
                    {piece && (
                      <span className={`text-4xl leading-none transition-transform duration-150 sm:text-5xl ${isSel ? "scale-110" : ""}`} style={pieceStyle(piece.c)}>
                        {glyphOf(piece)}
                      </span>
                    )}
                    {isCheck && (
                      <span className="pointer-events-none absolute inset-0 rounded-full bg-red-600/35 ring-2 ring-inset ring-red-600/70" />
                    )}
                    {isTarget && !capture && (
                      <span className="pointer-events-none absolute h-3.5 w-3.5 rounded-full bg-marker/70" />
                    )}
                    {capture && (
                      <span className="pointer-events-none absolute inset-1 rounded-md border-[3px] border-marker/80" />
                    )}
                    {f === 0 && <span className="absolute left-0.5 top-0 text-[10px] font-bold text-ink/50">{8 - r}</span>}
                    {r === lastRow && <span className="absolute bottom-0 right-1 text-[10px] font-bold text-ink/50">{"abcdefgh"[f]}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* الجانب — الأكل + السجل */}
        <aside className="space-y-3">
          <section className="sheet-card space-y-2 p-4">
            <h3 className="text-sm font-bold text-ink-soft">الأسرى</h3>
            <p className="text-lg leading-relaxed" style={pieceStyle("b")}>
              {captured.w.length ? captured.w.map((t) => glyphOf({ t: t as never, c: "b" })).join(" ") : "—"}
            </p>
            <p className="text-lg leading-relaxed" style={pieceStyle("w")}>
              {captured.b.length ? captured.b.map((t) => glyphOf({ t: t as never, c: "w" })).join(" ") : "—"}
            </p>
          </section>
          <section className="sheet-card space-y-1 p-4">
            <h3 className="text-sm font-bold text-ink-soft">آخر النقلات</h3>
            {history.length === 0 ? (
              <p className="text-xs text-ink-soft">ابدأ بنقلة بيدق 👋</p>
            ) : (
              <ol className="mono space-y-0.5 text-xs text-ink" dir="ltr">
                {history.map((h, i) => <li key={i}>{i + 1}. {h}</li>)}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {/* القوانين — شرح الحركات */}
      <details className="sheet-card group p-5">
        <summary className="cursor-pointer list-none text-sm font-bold text-ink-soft">
          📖 قوانين الشطرنج — إزاي تلعب <span className="inline-block transition-transform group-open:rotate-90">▸</span>
        </summary>
        <div className="mt-3 space-y-2 text-sm text-ink">
          {Object.entries(PIECE_NAMES).map(([k, v]) => (
            <p key={k}>
              <span className="mr-1 text-xl" style={pieceStyle("w")}>{glyphOf({ t: k as never, c: "w" })}</span>
              {v}
            </p>
          ))}
          <hr className="border-rule" />
          <p>🏰 <strong>التبييت:</strong> الملك يتحرك مربعين ناحية الرخ لو ما تحركش قبل كده، والمربعات بينهم فاضية، وهو مش في كش.</p>
          <p>⚔️ <strong>الأخذ بالتجاوز:</strong> بيدقك يقدر ياكل بيدق عدو نط نقلة مزدوجة جنبه — في نفس النقلة بس.</p>
          <p>👑 <strong>الترقية:</strong> البيدق اللي يوصل آخر صف بيتحول ملكة (وهنا بنرقّيها ملكة على طول).</p>
          <p>🏆 <strong>الكش مات:</strong> الملك مهدد ومفيش أي طريقة ينقذ نفسه = خسارة. لو مفيش حركات خالص ومفيش كش = تعادل بالحصر.</p>
          <p className="text-xs text-ink-soft">في Magicly: كل مباراة بتكسبك XP — وأول فوز في اليوم = 5 🪙</p>
        </div>
      </details>

      <p className="text-xs text-ink-soft">
        دوس على قطعة من قطعك الأبيض واختار المربع الأخضر — الإطار الكبير معناها أكل. المربع الأصفر = آخر نقلة، الدايرة الحمرا = كش.
      </p>
    </PageShell>
  );
}
