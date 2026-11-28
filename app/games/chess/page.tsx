"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageShell, DataNotice } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import {
  initialGame, legalMoves, makeMove, status, sqName, findKing, PIECE_VALUES,
  type GameState, type Move, type Piece, type PieceType,
} from "@/lib/games/chess/engine";
import { AI_LEVELS, AI_PERSONALITIES, chooseAiMove, type Difficulty, type Personality } from "@/lib/games/chess/ai";
import {
  BOARD_THEMES, PIECE_SETS, boardThemeById, glyphFor, pieceStyleFor,
  loadSettings, saveSettings, DEFAULT_SETTINGS, type ChessSettings,
} from "@/lib/games/chess/boards";
import { playSound } from "@/lib/games/chess/sounds";

/**
 * Magicly Chess ♟️ — بنمط chess.com: لوحة ثابتة كبيرة، إبراز واضح للمربعات،
 * سجل نقلات مرقّم، أسرى وميزان مادة — ومدرب «ماجِك» 🧙 بيعلّم الطالب أثناء اللعب.
 *
 * Phase 1 (Magic Chess Master Spec): ٨ مستويات AI + ٥ شخصيات لعب،
 * رقع وأطقم قطع وأصوات وإعدادات محفوظة، وحفظ المباريات في «مبارياتي».
 * النتيجة بتنزل للسيرفر عبر `arcade_submit_score` (db/124) — السيرفر بيحسب الـ XP والمكافآت.
 */

type SubmitResult = { xp: number; level: number; best: number; is_record: boolean; coins: number; achievements: string[]; message: string };
type CoachMood = "normal" | "happy" | "warn" | "sad";
type HistoryEntry = {
  at: string; won: boolean; draw: boolean; level: number; personality: string;
  score: number; plies: number; result: string;
};

const HISTORY_KEY = "magic-chess-history";
const AR_NAME: Record<PieceType, string> = { p: "بيدق", n: "فرس", b: "فيل", r: "رخ", q: "ملكة", k: "ملك" };

const PIECE_RULES: { g: PieceType; text: string }[] = [
  { g: "p", text: "البيدق — خطوة واحدة لقدام (اتنين من بدايته) ويأكل بالتراخي، ولو وصلك آخر صف بيتحوّل ملكة" },
  { g: "n", text: "الفرس — حركة حرف L وبيقدر ينط فوق القطع" },
  { g: "b", text: "الفيل — قطرية بس، وبيلون واحد طول حياته" },
  { g: "r", text: "الرخ — خطوط مستقيمة طولية وعرضية" },
  { g: "q", text: "الملكة — مستقيم وقطرية (أقوى قطعة في اللعبة)" },
  { g: "k", text: "الملك — مربع واحد في أي اتجاه، ولو اتحاصر (كش مات) خسرت" },
];

function saveHistory(entry: HistoryEntry): void {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* التخزين غير متاح */
  }
}

export default function ChessPage() {
  const { supabase, session } = useAuthUser();
  const [game, setGame] = useState<GameState>(() => initialGame());
  const gameRef = useRef(game); // مرجع حي — الـ AI بيقرأ منه من غير تحديثات جوه الـ setState
  useEffect(() => { gameRef.current = game; }, [game]);

  const [selected, setSelected] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(3);
  const [personality, setPersonality] = useState<Personality>("default");
  const [settings, setSettings] = useState<ChessSettings>(DEFAULT_SETTINGS);
  useEffect(() => { setSettings(loadSettings()); }, []); // إعدادات اللاعب — بعد التحميل (client-only)
  const updateSettings = useCallback((patch: Partial<ChessSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const theme = boardThemeById(settings.theme);
  const personalityInfo = AI_PERSONALITIES.find((p) => p.id === personality) ?? AI_PERSONALITIES[0];

  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [finished, setFinished] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [captured, setCaptured] = useState<{ byPlayer: PieceType[]; byAi: PieceType[] }>({ byPlayer: [], byAi: [] });
  const [sanList, setSanList] = useState<string[]>([]);
  const [past, setPast] = useState<GameState[]>([]); // للتراجع
  const [coach, setCoach] = useState<{ text: string; mood: CoachMood }>({
    text: "أنا ماجِك 🧙 — العب بالأبيض: دوس على قطعة، المربعات الملونة هي اللي تقدر تتحرك عليها!",
    mood: "normal",
  });
  const submitted = useRef(false);

  const moves = useMemo(() => legalMoves(game), [game]);
  const st = useMemo(() => status(game), [game]);
  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((m) => m.from === selected)),
    [moves, selected],
  );
  const targetSet = useMemo(() => new Set(targets.map((m) => m.to)), [targets]);
  const checkedKing = useMemo(
    () => (st === "check" || st === "checkmate" ? findKing(game.board, game.turn) : -1),
    [st, game],
  );
  // ميزان المادة — من منظور اللاعب (الأبيض)
  const materialDiff = useMemo(() => {
    let d = 0;
    for (const p of game.board) {
      if (!p || p.t === "k") continue;
      d += p.c === "w" ? PIECE_VALUES[p.t] : -PIECE_VALUES[p.t];
    }
    return Math.round(d / 100);
  }, [game]);

  /** رسالة المدرب — بتتحدث مع الأحداث المهمة */
  const say = useCallback((text: string, mood: CoachMood = "normal") => setCoach({ text, mood }), []);

  // تسجيل النتيجة مرة واحدة عند النهاية — السيرفر بيحسب المكافآت + حفظ المباراة في «مبارياتي»
  const finish = useCallback(async (finalState: GameState, playerWon: boolean) => {
    if (submitted.current) return;
    submitted.current = true;
    setFinished(true);
    const draw = status(finalState) === "stalemate";
    say(playerWon ? "كش مات! فزت 🎉 خطتك كانت حلوة — مكافأتك في الطريق!" : draw ? "تعادل بالحصر — مباراة محترمة 🤝" : "خسرت الجولة دي… بس كل مباراة بتعلّمك حاجة. جرب تاني!", playerWon ? "happy" : "sad");
    playSound(playerWon ? "win" : "lose", settings.sound);
    const material = finalState.board.reduce(
      (sum, p) => sum + (p && p.c === "w" ? { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[p.t] : 0),
      0,
    );
    const score = playerWon ? 100 + material * 10 : material * 10;
    saveHistory({
      at: new Date().toISOString(),
      won: playerWon,
      draw,
      level: difficulty,
      personality: personalityInfo.label,
      score,
      plies: sanList.length,
      result: playerWon ? "فوز" : draw ? "تعادل" : "خسارة",
    });
    if (!supabase || session.status !== "ready") return;
    const { data, error } = await supabase.rpc("arcade_submit_score", {
      p_game: "chess", p_score: score, p_won: playerWon,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) setNote(error.message);
    else if (row) setResult(row as SubmitResult);
  }, [supabase, session.status, say, difficulty, personalityInfo, sanList, settings.sound]);

  // نهاية المباراة — مات أو حصر (بغض النظر عن الحالة الوسيطة)
  useEffect(() => {
    if (st === "checkmate") void finish(game, game.turn === "b");
    else if (st === "stalemate") void finish(game, false);
  }, [st, game, finish]);

  /** نقلة الـ AI — بتتقرأ من gameRef (updater نضيف بلا تأثيرات جانبية) */
  const aiTurn = useCallback(() => {
    setThinking(true);
    window.setTimeout(() => {
      const current = gameRef.current;
      if (status(current) === "checkmate" || status(current) === "stalemate" || gameRef.current !== current) {
        setThinking(false);
        return;
      }
      const move = chooseAiMove(current, difficulty, personality);
      if (!move) { setThinking(false); return; }

      const victim = current.board[move.to];
      setPast((p) => [...p, current]);
      setLastMove({ from: move.from, to: move.to });
      if (victim) {
        setCaptured((cap) => ({ ...cap, byAi: [...cap.byAi, victim.t] }));
        if (PIECE_VALUES[victim.t] >= 300) {
          say(`خسرت ${AR_NAME[victim.t]}! 😬 المرة الجاية غطّي قطعك بحتة تانية قبل ما تتحرك`, "warn");
        }
      }
      setSanList((l) => [...l, `…${sqName(move.from)}${victim ? "x" : "–"}${sqName(move.to)}`]);
      const next = makeMove(current, move);
      gameRef.current = next;
      setGame(next);
      setThinking(false);
      playSound(victim ? "capture" : "move", settings.sound);
      if (status(next) === "check") { playSound("check", settings.sound); say("بعد ما كشّيتني، رجّعت الخطر! 👀 خلي بالك من ملكك", "warn"); }
    }, 250);
  }, [difficulty, personality, say, settings.sound]);

  const onSquare = (sq: number) => {
    if (thinking || finished || game.turn !== "w") return;
    const piece: Piece | null = game.board[sq];

    if (selected !== null) {
      const move = targets.find((m) => m.to === sq);
      if (move) {
        const promo = move.promo ? { ...move, promo: "q" as const } : move;
        const victim = game.board[move.to];
        const next = makeMove(game, promo);

        setPast((p) => [...p, game]);
        setLastMove({ from: move.from, to: move.to });
        if (victim) {
          setCaptured((cap) => ({ ...cap, byPlayer: [...cap.byPlayer, victim.t] }));
          say(PIECE_VALUES[victim.t] >= 500 ? "أكلت قطعة كبيرة! 🔥 كويس جدًا" : "أكلت قطعة! 👏 كمّل تقدّمك", "happy");
        }
        setSanList((l) => [...l, `${l.filter((x) => !x.startsWith("…")).length + 1}. ${sqName(move.from)}${victim ? "x" : "–"}${sqName(move.to)}`]);

        setSelected(null);
        gameRef.current = next;
        setGame(next);

        const nextStatus = status(next);
        if (nextStatus === "checkmate" || nextStatus === "stalemate") return; // الإنهاء في الـ effect
        playSound(victim ? "capture" : "move", settings.sound);
        if (nextStatus === "check") { playSound("check", settings.sound); say("كش على ملك الكومبيوتر! 🎉 استنى هروبه وكمّل", "happy"); }
        aiTurn(); // ← الباج القديم: الكش كان بيوقف الكمبيوتر — اتصلح
        return;
      }
    }
    if (piece && piece.c === "w") {
      setSelected(sq);
      if (st === "check") say("ملكك في كش! لازم تنقذه الأول — حرّكه أو احجب الخطر", "warn");
    } else {
      setSelected(null);
    }
  };

  const restart = () => {
    submitted.current = false;
    const fresh = initialGame();
    gameRef.current = fresh;
    setGame(fresh);
    setSelected(null);
    setResult(null);
    setFinished(false);
    setNote("");
    setLastMove(null);
    setCaptured({ byPlayer: [], byAi: [] });
    setSanList([]);
    setPast([]);
    say("مباراة جديدة! العب بالأبيض — وأنا معاك خطوة بخطوة 🧙", "normal");
  };

  /** تراجع نقلة (اللاعب + الكمبيوتر) */
  const takeback = () => {
    if (finished || past.length === 0) return;
    // نرجع لآخر وضع كان دوره فيه اللاعب — نقلة كاملة للورا
    let target = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    if (target.turn === "b" && past.length >= 2) {
      target = past[past.length - 2];
      setPast((p) => p.slice(0, -1));
    }
    gameRef.current = target;
    setGame(target);
    setLastMove(null);
    setSanList((l) => l.slice(0, -2));
    say("رجعنا نقلة — فكّر تاني، أنا معاك 💪", "normal");
  };

  const lastRow = 7; // صف العرض الأخير (بعد الـ flip بنحسب على موضع العرض)

  return (
    <PageShell
      eyebrow="Magicly Chess"
      title="♟️ شطرنج ماجِك"
      lede="٨ مستويات + ٥ شخصيات لعب، رقع وقطع تختارها — كل فوز بيكسبك XP وأول فوز في اليوم بيكسب 5 Coins."
      action={
        <>
          <Link className="btn btn-quiet text-sm" href="/games/chess/history">📋 مبارياتي</Link>
          <button className="btn btn-quiet text-sm" onClick={takeback} disabled={finished || past.length === 0}>↩️ تراجع</button>
          <button className="btn btn-quiet text-sm" onClick={restart}>مباراة جديدة</button>
        </>
      }
    >
      {note && <DataNotice message={note} />}

      {/* 🧙 المدرب ماجِك — بيعلّم أثناء اللعب */}
      <section className="sheet-card flex items-start gap-3 p-4">
        <span className={`text-4xl leading-none transition-transform ${coach.mood === "happy" ? "animate-bounce" : ""}`}>
          {coach.mood === "warn" ? "🧙‍♂️⚠️" : coach.mood === "sad" ? "🧙‍♂️💭" : "🧙‍♂️"}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-marker">ماجِك — مدربك</p>
          <p className="text-sm text-ink">{coach.text}</p>
        </div>
      </section>

      {/* بطاقتا اللاعبين — أعلى: الكمبيوتر · أسفل: أنت (نمط chess.com) */}
      <div className="mx-auto w-fit max-w-full">
        <PlayerCard
          name={`Magicly AI — ${AI_LEVELS[difficulty].label}${personality !== "default" ? ` ${personalityInfo.emoji}` : ""}`}
          emoji="🤖"
          sub={personality !== "default" ? personalityInfo.desc : "بيفكر بالحساب مش بالإحساس"}
          captured={captured.byAi.map((t) => (
            <span key={t} style={pieceStyleFor(settings.pieceSet, "w")}>{glyphFor(settings.pieceSet, { t, c: "w" })}</span>
          ))}
          material={-Math.max(0, materialDiff)}
          active={game.turn === "b" && !finished}
          thinking={thinking}
        />
      </div>

      {/* المستويات — ٨ مستويات من مبتدئ لمحترف */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {([1, 2, 3, 4, 5, 6, 7, 8] as Difficulty[]).map((d) => (
          <button
            key={d}
            title={AI_LEVELS[d].desc}
            className={`btn text-sm ${difficulty === d ? "btn-marker" : "btn-quiet"}`}
            onClick={() => setDifficulty(d)}
          >
            {AI_LEVELS[d].label}
          </button>
        ))}
        <span className="tag">
          {finished
            ? st === "checkmate" ? (game.turn === "b" ? "🎉 كسبت!" : "💀 خسرت") : "🤝 تعادل بالحصر"
            : thinking ? "الكمبيوتر بيفكر…" : "دورك"}
        </span>
      </div>

      {/* شخصيات الـ AI — أسلوب اللعب (نفس القوة، أسلوب مختلف) */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-xs font-bold text-ink-soft">شخصية الخصم:</span>
        {AI_PERSONALITIES.map((p) => (
          <button
            key={p.id}
            title={p.desc}
            className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${personality === p.id ? "bg-marker/20 text-marker ring-1 ring-marker" : "bg-black/5 text-ink-soft hover:bg-black/10"}`}
            onClick={() => setPersonality(p.id)}
          >
            {p.emoji} {p.label}
          </button>
        ))}
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

      <div className="mx-auto grid w-fit max-w-full gap-3 lg:grid-cols-[auto_240px]">
        {/* اللوحة — مربعات ثابتة (مش بتصغر وتكبر) مع تمرير أفقي لو الشاشة ضيقة */}
        <div className="overflow-x-auto pb-1" dir="ltr">
          <div className="w-[456px] sm:w-[512px]">
            <div className="overflow-hidden rounded-xl border-4 shadow-lg" style={{ borderColor: theme.frame }}>
              <div className="grid grid-cols-8 select-none">
                {Array.from({ length: 64 }, (_, i) => {
                  const sq = settings.flipped ? 63 - i : i; // قلب الرقعة — منظور اللاعب
                  const piece = game.board[sq];
                  const r = Math.floor(sq / 8), f = sq % 8;
                  const dRow = Math.floor(i / 8), dCol = i % 8;
                  const dark = (r + f) % 2 === 1;
                  const isTarget = settings.showLegal && targetSet.has(sq);
                  const capture = isTarget && piece !== null;
                  const isSel = selected === sq;
                  const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                  const isCheck = checkedKing === sq;
                  const mine = piece && piece.c === "w" && !finished && game.turn === "w";
                  return (
                    <button
                      key={i}
                      onClick={() => onSquare(sq)}
                      className={`relative flex h-[57px] w-[57px] items-center justify-center transition-[background-color,box-shadow] duration-100 sm:h-16 sm:w-16 ${isLast ? "!bg-[#f2e394]" : ""} ${isSel ? "shadow-[inset_0_0_0_3px_var(--color-marker,#eab308)]" : ""} ${
                        isTarget ? "!bg-[#a3c98a] ring-1 ring-inset ring-[#6f9e55]" : ""
                      } ${capture ? "!bg-[#d98d7c] ring-2 ring-inset ring-[#a04b38]" : ""} ${
                        mine ? "cursor-pointer hover:brightness-110" : "cursor-default"
                      }`}
                      style={{ backgroundColor: dark ? theme.dark : theme.light }}
                      aria-label={`${sqName(sq)}${piece ? ` ${piece.c === "w" ? "أبيض" : "أسود"}` : ""}`}
                    >
                      {piece && (
                        <span
                          className={`pointer-events-none text-[40px] leading-none transition-transform duration-100 sm:text-[44px] ${isSel ? "scale-110" : ""}`}
                          style={pieceStyleFor(settings.pieceSet, piece.c)}
                        >
                          {glyphFor(settings.pieceSet, piece)}
                        </span>
                      )}
                      {isCheck && (
                        <span className="pointer-events-none absolute inset-0 rounded-full bg-red-600/40 ring-2 ring-inset ring-red-600/80" />
                      )}
                      {settings.coords && dCol === 0 && <span className="pointer-events-none absolute left-0.5 top-0 text-[10px] font-bold text-ink/45">{8 - r}</span>}
                      {settings.coords && dRow === lastRow && <span className="pointer-events-none absolute bottom-0 right-1 text-[10px] font-bold text-ink/45">{"abcdefgh"[f]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* الجانب — الأسرى والميزان + سجل النقلات + الإعدادات */}
        <aside className="w-[240px] max-w-full space-y-3">
          <section className="sheet-card space-y-2 p-4">
            <h3 className="text-sm font-bold text-ink-soft">الأسرى والميزان</h3>
            <div className="flex flex-wrap items-center gap-1 text-xl">
              {captured.byPlayer.length
                ? captured.byPlayer.map((t, i) => <span key={i} style={pieceStyleFor(settings.pieceSet, "b")}>{glyphFor(settings.pieceSet, { t, c: "b" })}</span>)
                : <span className="text-xs text-ink-soft">—</span>}
              {materialDiff > 0 && <span className="mono ml-auto text-xs font-bold text-marker">+{materialDiff}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xl">
              {captured.byAi.length
                ? captured.byAi.map((t, i) => <span key={i} style={pieceStyleFor(settings.pieceSet, "w")}>{glyphFor(settings.pieceSet, { t, c: "w" })}</span>)
                : <span className="text-xs text-ink-soft">—</span>}
              {materialDiff < 0 && <span className="mono ml-auto text-xs font-bold text-ink-soft">+{-materialDiff}</span>}
            </div>
          </section>
          <section className="sheet-card space-y-1 p-4">
            <h3 className="text-sm font-bold text-ink-soft">سجل النقلات</h3>
            {sanList.length === 0 ? (
              <p className="text-xs text-ink-soft">ابدأ بنقلة بيدق 👋</p>
            ) : (
              <ol className="mono max-h-40 space-y-0.5 overflow-y-auto text-xs text-ink" dir="ltr">
                {sanList.map((h, i) => <li key={i}>{h}</li>)}
              </ol>
            )}
          </section>

          {/* ⚙️ إعدادات الرقعة — بتتحفظ تلقائيًا */}
          <details className="sheet-card p-4">
            <summary className="cursor-pointer list-none text-sm font-bold text-ink-soft">⚙️ إعدادات الرقعة</summary>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs font-bold text-ink-soft">الرقعة</span>
                <select
                  className="input mt-1 w-full text-xs"
                  value={settings.theme}
                  onChange={(e) => updateSettings({ theme: e.target.value })}
                >
                  {BOARD_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-ink-soft">طقم القطع</span>
                <select
                  className="input mt-1 w-full text-xs"
                  value={settings.pieceSet}
                  onChange={(e) => updateSettings({ pieceSet: e.target.value as ChessSettings["pieceSet"] })}
                >
                  {PIECE_SETS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} />
                  🔊 الأصوات
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={settings.showLegal} onChange={(e) => updateSettings({ showLegal: e.target.checked })} />
                  🟩 إظهار النقلات الممكنة
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={settings.coords} onChange={(e) => updateSettings({ coords: e.target.checked })} />
                  #️⃣ إظهار الإحداثيات
                </label>
              </div>
              <button className="btn btn-quiet w-full text-xs" onClick={() => updateSettings({ flipped: !settings.flipped })}>
                🔄 قلب الرقعة
              </button>
            </div>
          </details>
        </aside>
      </div>

      <PlayerCard
        name="أنت"
        emoji="🧑‍🎓"
        sub="الأبيض — دوس على قطعة وابدأ"
        captured={captured.byPlayer.map((t) => (
          <span key={t} style={pieceStyleFor(settings.pieceSet, "b")}>{glyphFor(settings.pieceSet, { t, c: "b" })}</span>
        ))}
        material={Math.max(0, materialDiff)}
        active={game.turn === "w" && !finished}
        thinking={false}
      />

      {/* التعليمات — دايمًا ظاهرة */}
      <section className="sheet-card space-y-2 p-5">
        <h2 className="h3">📖 إزاي تلعب — التعليمات</h2>
        <ol className="list-inside list-decimal space-y-1.5 text-sm text-ink">
          <li>انت الأبيض — <strong>الأبيض بيبدأ دايمًا</strong>. دوس على أي قطعة بيضاء.</li>
          <li>المربعات <span className="mx-1 inline-block h-3 w-3 rounded-sm bg-[#a3c98a] align-middle" /> الخضرا = حركات قانونية لقطعتك · <span className="mx-1 inline-block h-3 w-3 rounded-sm bg-[#d98d7c] align-middle" /> الحمرا = أكل قطعة عدو.</li>
          <li>المربع <span className="mx-1 inline-block h-3 w-3 rounded-sm bg-[#f2e394] align-middle" /> الأصفر = آخر نقلة اتحركت — تابعها.</li>
          <li>الدايرة الحمرا حوالين الملك = <strong>كش</strong> — لازم تنقذه فورًا.</li>
          <li>الفوز = <strong>كش مات</strong> (الملك مهدد ومفيش مخرج). تعادل بالحصر لو مفيش حركات ومفيش كش.</li>
          <li>ملحوظة: <strong>غالبًا ما تنسّلش ملكتك</strong> في البداية — طلّع الفيل والفرس الأول، وبيّت (Castling) بيوفر ملكك بسرعة.</li>
        </ol>
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-sm font-bold text-ink-soft">
            🎓 تفاصيل حركة كل قطعة <span className="inline-block transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm text-ink">
            {PIECE_RULES.map(({ g, text }) => (
              <p key={g} className="flex items-start gap-2">
                <span className="text-xl leading-none" style={pieceStyleFor("classic", "w")}>{glyphFor("classic", { t: g, c: "w" })}</span>
                <span>{text}</span>
              </p>
            ))}
            <p>🏰 <strong>التبييت:</strong> الملك مربعين ناحية الرخ لو الاتنين ماتحركوش، المربعات بينهم فاضية، والمربعات اللي بيعدي عليها مش مهاومة.</p>
            <p>⚔️ <strong>الأخذ بالتجاوز (En Passant):</strong> بيدقك ياكل بيدق عدو نط نقلة مزدوجة جنبه — في نفس النقلة بس.</p>
            <p className="text-xs text-ink-soft">في Magicly: كل مباراة XP — أول فوز في اليوم = 5 🪙</p>
          </div>
        </details>
      </section>
    </PageShell>
  );
}

/** بطاقة لاعب — أعلى/أسفل اللوحة بنمط chess.com */
function PlayerCard({ name, emoji, sub, captured, material, active, thinking }: {
  name: string; emoji: string; sub: string; captured: React.ReactNode[];
  material: number; active: boolean; thinking: boolean;
}) {
  return (
    <div className={`sheet-card flex w-full items-center gap-3 px-4 py-2.5 transition ${active ? "border-marker/70" : ""}`}>
      <span className={`text-2xl ${thinking ? "animate-pulse" : ""}`}>{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{name} {active && <span className="text-marker">• دورُه</span>}</p>
        <p className="truncate text-xs text-ink-soft">{sub}</p>
      </div>
      <div className="flex max-w-[45%] flex-wrap items-center gap-0.5 text-lg leading-none">{captured}</div>
      {material > 0 && <span className="mono text-xs font-bold text-marker">+{material}</span>}
    </div>
  );
}
