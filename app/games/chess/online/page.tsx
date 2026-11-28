"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageShell, DataNotice } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import {
  makeMove, status, sqName, findKing, legalMoves,
  type GameState, type Piece,
} from "@/lib/games/chess/engine";
import {
  TIME_CONTROLS, CATEGORY_NAMES, formatClock, remainingMs,
  type ChessCategory, type ChessGameRow, type ChessRatingsRow, type TimeControl,
} from "@/lib/games/chess/online";
import {
  BOARD_THEMES, boardThemeById, glyphFor, pieceStyleFor,
  loadSettings, type ChessSettings,
} from "@/lib/games/chess/boards";
import { playSound } from "@/lib/games/chess/sounds";

/**
 * 🌍 Magic Chess Online — Phase 2 (Master Spec).
 *
 * matchmaking بالـ Rating عبر `chess_join_queue` (db/125)، ساعات سيرفرية،
 * وكل نقلة بتتحقق على السيرفر بمحرك الشطرنج عبر /api/chess/move —
 * العميل مبيكتبش على المباراة مباشرة أبدًا.
 */

export default function ChessOnlinePage() {
  const { supabase, session } = useAuthUser();
  const userId = session.status === "ready" ? session.user.id : null;

  const [phase, setPhase] = useState<"choose" | "queue" | "game">("choose");
  const [tc, setTc] = useState<TimeControl>(TIME_CONTROLS[1]); // Blitz 5+0
  const [rated, setRated] = useState(true);
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<ChessGameRow | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [myRatings, setMyRatings] = useState<ChessRatingsRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState("");
  const [settings, setSettings] = useState<ChessSettings | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => { setSettings(loadSettings()); }, []);

  /** لوني في المباراة */
  const myColor = useCallback((g: ChessGameRow, uid: string | null): "w" | "b" =>
    g.black === uid ? "b" : "w", []);

  const refreshGame = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("chess_games")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) setGame(data as ChessGameRow);
    return (data as ChessGameRow | null) ?? null;
  }, [supabase]);

  const refreshRatings = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("chess_ratings")
      .select("bullet, blitz, rapid, classical, wins, losses, draws")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) setMyRatings(data as ChessRatingsRow);
  }, [supabase, userId]);

  useEffect(() => { void refreshRatings(); }, [refreshRatings]);

  /** الطابور — جولة كل 2.5s: بتجيب مباراة قديمة شغالة (إعادة اتصال)
   *  أو خصم جديد، ولو مفيش بتسجلني — RPC idempotent */
  const pollQueue = useCallback(async () => {
    if (session.status !== "ready") return;
    const { data, error } = await supabase.rpc("chess_join_queue", {
      p_category: tc.category,
      p_initial_seconds: tc.initialSeconds,
      p_increment_seconds: tc.incrementSeconds,
      p_rated: rated,
    });
    if (error) { setNote(error.message); return; }
    const gid = Array.isArray(data) ? data[0] : data;
    if (gid) {
      setGameId(gid as string);
      const g = await refreshGame(gid as string);
      if (g) setPhase("game");
    }
  }, [supabase, tc, rated, session.status, refreshGame]);

  useEffect(() => {
    if (phase !== "queue") return;
    void pollQueue();
    const id = window.setInterval(() => void pollQueue(), 2500);
    return () => window.clearInterval(id);
  }, [phase, pollQueue]);

  // الساعة — tick محلي كل 250ms أثناء المباراة
  useEffect(() => {
    if (phase !== "game") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // متابعة المباراة — جولة كل 1.5s
  useEffect(() => {
    if (phase !== "game" || !gameId) return;
    const id = window.setInterval(async () => {
      const g = await refreshGame(gameId);
      if (g && g.status === "finished" && !submittedRef.current) {
        submittedRef.current = true;
        const won = g.result !== "draw" && g.result && userId
          ? (g.result === "white" ? g.white === userId : g.black === userId)
          : false;
        playSound(won ? "win" : "lose", settings?.sound ?? false);
        void refreshRatings();
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [phase, gameId, refreshGame, refreshRatings, settings?.sound, userId]);

  // انتهاء وقت من على الساعة — المطالبة من السيرفر (بيتحقق بالحساب)
  useEffect(() => {
    if (phase !== "game" || !game || game.status !== "active" || !gameId || !userId) return;
    const rem = remainingMs(game, Date.now());
    const moverMs = game.state.turn === "w" ? rem.white : rem.black;
    if (moverMs > 0) return;
    void (async () => {
      const { data } = await supabase.rpc("chess_claim_timeout", { p_game_id: gameId });
      await refreshGame(gameId);
      if (data && data !== "not_expired" && !submittedRef.current) {
        submittedRef.current = true;
        void refreshRatings();
      }
    })();
  }, [phase, game, gameId, userId, supabase, refreshGame, refreshRatings]);

  const leaveQueue = async () => {
    await supabase.rpc("chess_leave_queue", {
      p_category: tc.category, p_initial_seconds: tc.initialSeconds,
      p_increment_seconds: tc.incrementSeconds, p_rated: rated,
    });
    setPhase("choose");
  };

  const resign = async () => {
    if (!gameId) return;
    await supabase.rpc("chess_resign", { p_game_id: gameId });
    await refreshGame(gameId);
    if (!submittedRef.current) { submittedRef.current = true; void refreshRatings(); }
  };

  /** النقلة — عبر السيرفر (تحقق كامل) */
  const sendMove = async (from: number, to: number, promo?: string) => {
    if (!gameId) return false;
    const res = await fetch("/api/chess/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, from, to, promo }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      if (json?.code === "NOT_YOUR_TURN" || json?.code === "ILLEGAL_MOVE") setSelected(null);
      else if (json?.error) setNote(json.error);
      return false;
    }
    await refreshGame(gameId);
    return true;
  };

  const st = useMemo(() => (game ? status(game.state as unknown as GameState) : "playing"), [game]);

  const onSquare = async (sq: number) => {
    if (!game || game.status !== "active" || !userId) return;
    const color = myColor(game, userId);
    if (game.state.turn !== color) return;
    const state = game.state as unknown as GameState;

    if (selected !== null) {
      const move = legalMoves(state).find((m) => m.from === selected && m.to === sq);
      if (move) {
        const promo = move.promo ? "q" : undefined;
        const victim = state.board[move.to];
        const optimistic = makeMove(state, promo ? { ...move, promo: "q" } : move);
        setGame({ ...game, state: optimistic as unknown as ChessGameRow["state"] });
        setSelected(null);
        const sent = await sendMove(move.from, move.to, promo);
        if (sent && settings?.sound) {
          playSound(victim ? "capture" : "move", true);
          if (status(optimistic) === "check") playSound("check", true);
        }
        return;
      }
    }
    const piece: Piece | null = state.board[sq];
    if (piece && piece.c === myColor(game, userId)) setSelected(sq);
    else setSelected(null);
  };

  const theme = settings ? boardThemeById(settings.theme) : BOARD_THEMES[0];
  const pieceSet = settings?.pieceSet ?? "classic";

  const ratingFor = (c: ChessCategory | undefined) =>
    !myRatings || !c ? null : c === "bullet" ? myRatings.bullet : c === "blitz" ? myRatings.blitz : c === "rapid" ? myRatings.rapid : myRatings.classical;

  const color = game && userId ? myColor(game, userId) : "w";
  const flipped = color === "b"; // قلب تلقائي — الأسود بيشوف نفسه تحت
  const rem = game ? remainingMs(game, now) : null;
  const myTurn = Boolean(game && userId && game.state.turn === color && game.status === "active");
  const checkedKing = useMemo(() => {
    if (!game || (st !== "check" && st !== "checkmate")) return -1;
    return findKing((game.state as unknown as GameState).board, game.state.turn);
  }, [game, st]);
  const targetSet = useMemo(() => {
    if (!game || selected === null || !userId || !myTurn) return new Set<number>();
    try {
      return new Set(
        legalMoves(game.state as unknown as GameState)
          .filter((m) => m.from === selected)
          .map((m) => m.to),
      );
    } catch {
      return new Set<number>();
    }
  }, [game, selected, userId, myTurn]);

  return (
    <PageShell
      eyebrow="Magicly Chess"
      title="🌍 شطرنج أونلاين"
      lede="العب ضد طلبة حقيقيين — Rating مستقل لكل فئة وقت، وساعات على السيرفر."
      action={<Link className="btn btn-quiet text-sm" href="/games/chess">♟️ رجوع للشطرنج</Link>}
    >
      {note && <DataNotice message={note} />}

      {/* اختيار الفئة والانضمام */}
      {phase === "choose" && (
        <section className="sheet-card space-y-4 p-5">
          <h2 className="h3">اختار فئة الوقت</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIME_CONTROLS.map((t) => (
              <button
                key={t.category}
                className={`btn text-sm ${tc.category === t.category ? "btn-marker" : "btn-quiet"} justify-between`}
                onClick={() => setTc(t)}
              >
                <span>{t.label}</span>
                <span className="text-xs opacity-70">{CATEGORY_NAMES[t.category]}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} />
            🏆 مباراة مرتبة — بتأثر على الـ Rating
          </label>
          <p className="text-xs text-ink-soft">
            Rating الحالي: {ratingFor(tc.category) ?? "—"} · فوز {myRatings?.wins ?? 0} · خسارة {myRatings?.losses ?? 0} · تعادل {myRatings?.draws ?? 0}
          </p>
          <button
            className="btn btn-marker mx-auto w-fit"
            disabled={session.status !== "ready"}
            onClick={() => { submittedRef.current = false; setPhase("queue"); }}
          >
            {session.status === "ready" ? "🔍 ابحث عن خصم" : "سجّل الدخول الأول"}
          </button>
        </section>
      )}

      {/* البحث عن خصم */}
      {phase === "queue" && (
        <section className="sheet-card space-y-3 p-8 text-center">
          <p className="animate-pulse text-4xl">🔍</p>
          <p className="font-bold">بندور على خصم {tc.label}…</p>
          <p className="text-xs text-ink-soft">{rated ? "مباراة مرتبة — الفوز والخسارة بيتأثر على الـ Rating" : "مباراة ودية — بدون Rating"}</p>
          <button className="btn btn-quiet mx-auto text-sm" onClick={leaveQueue}>إلغاء البحث</button>
        </section>
      )}

      {/* المباراة */}
      {phase === "game" && game && (
        <>
          <div className="mx-auto w-fit max-w-full">
            <ClockCard
              label={color === "w" ? "الخصم (الأسود)" : "الخصم (الأبيض)"}
              ms={rem ? (color === "w" ? rem.black : rem.white) : 0}
              active={game.status === "active" && game.state.turn !== color}
            />
          </div>

          <div className="overflow-x-auto pb-1" dir="ltr">
            <div className="w-[456px] sm:w-[512px]">
              <div className="overflow-hidden rounded-xl border-4 shadow-lg" style={{ borderColor: theme.frame }}>
                <div className="grid grid-cols-8 select-none">
                  {Array.from({ length: 64 }, (_, i) => {
                    const sq = flipped ? 63 - i : i;
                    const piece = (game.state as unknown as GameState).board[sq] as Piece | null;
                    const r = Math.floor(sq / 8), f = sq % 8;
                    const dark = (r + f) % 2 === 1;
                    const isSel = selected === sq;
                    const isTarget = targetSet.has(sq);
                    const capture = isTarget && piece !== null;
                    const isCheck = checkedKing === sq;
                    const mine = piece && piece.c === color && myTurn;
                    return (
                      <button
                        key={i}
                        onClick={() => void onSquare(sq)}
                        className={`relative flex h-[57px] w-[57px] items-center justify-center transition-[background-color,box-shadow] duration-100 sm:h-16 sm:w-16 ${isTarget ? "!bg-[#a3c98a] ring-1 ring-inset ring-[#6f9e55]" : ""} ${capture ? "!bg-[#d98d7c] ring-2 ring-inset ring-[#a04b38]" : ""} ${isSel ? "shadow-[inset_0_0_0_3px_var(--color-marker,#eab308)]" : ""} ${mine ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                        style={{ backgroundColor: dark ? theme.dark : theme.light }}
                        aria-label={`${sqName(sq)}${piece ? ` ${piece.c === "w" ? "أبيض" : "أسود"}` : ""}`}
                      >
                        {piece && (
                          <span
                            className={`pointer-events-none text-[40px] leading-none sm:text-[44px] ${isSel ? "scale-110" : ""}`}
                            style={pieceStyleFor(pieceSet, piece.c)}
                          >
                            {glyphFor(pieceSet, piece)}
                          </span>
                        )}
                        {isCheck && <span className="pointer-events-none absolute inset-0 rounded-full bg-red-600/40 ring-2 ring-inset ring-red-600/80" />}
                        {settings?.coords !== false && f === 0 && <span className="pointer-events-none absolute left-0.5 top-0 text-[10px] font-bold text-ink/45">{8 - r}</span>}
                        {settings?.coords !== false && Math.floor(i / 8) === 7 && <span className="pointer-events-none absolute bottom-0 right-1 text-[10px] font-bold text-ink/45">{"abcdefgh"[f]}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto w-fit max-w-full">
            <ClockCard
              label={color === "w" ? "أنت (الأبيض)" : "أنت (الأسود)"}
              ms={rem ? (color === "w" ? rem.white : rem.black) : 0}
              active={game.status === "active" && game.state.turn === color}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="tag">{game.status !== "active" ? "انتهت المباراة" : myTurn ? "دورك" : "دور الخصم"}</span>
            {game.status === "active" && (
              <button className="btn btn-quiet text-sm" onClick={resign}>🏳️ استسلام</button>
            )}
            <span className="text-xs text-ink-soft">
              {CATEGORY_NAMES[game.category]} · {Math.round(game.initial_seconds / 60)}+{game.increment_seconds} · {game.rated ? "مرتبة 🏆" : "ودية"}
            </span>
          </div>

          {/* النتيجة */}
          {game.status === "finished" && (
            <section className="sheet-card space-y-2 p-5 text-center">
              <h2 className="h3">
                {game.result === "draw" ? "🤝 تعادل" : (game.result === "white" ? "w" : "b") === color ? "🎉 فزت!" : "💀 خسرت"}
              </h2>
              <p className="text-sm text-ink-soft">
                السبب: {game.result_reason === "checkmate" ? "كش مات" : game.result_reason === "timeout" ? "انتهاء الوقت" : game.result_reason === "resign" ? "استسلام" : game.result_reason === "stalemate" ? "حصر" : game.result_reason ?? "—"}
              </p>
              {game.rated && myRatings && (
                <p className="text-sm font-bold text-marker">Rating {CATEGORY_NAMES[game.category]}: {ratingFor(game.category)}</p>
              )}
              <div className="flex justify-center gap-2">
                <button className="btn btn-marker text-sm" onClick={() => { setGame(null); setGameId(null); submittedRef.current = false; setPhase("choose"); }}>
                  مباراة جديدة
                </button>
                <Link className="btn btn-quiet text-sm" href="/games/chess">♟️ رجوع</Link>
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}

/** بطاقة الساعة — بنمط chess.com */
function ClockCard({ label, ms, active }: { label: string; ms: number; active: boolean }) {
  const low = ms < 30_000;
  return (
    <div className={`sheet-card flex w-full items-center gap-3 px-4 py-2.5 ${active ? "border-marker/70" : ""}`}>
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{label} {active && <span className="text-marker">• دورُه</span>}</span>
      <span className={`mono rounded-lg px-3 py-1 text-lg font-bold ${active ? "bg-ink/5" : "opacity-60"} ${low && active ? "text-red-500" : ""}`} dir="ltr">
        {formatClock(ms)}
      </span>
    </div>
  );
}
