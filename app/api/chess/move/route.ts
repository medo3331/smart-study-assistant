/**
 * /api/chess/move — نقلة شطرنج أونلاين — **تحقق سيرفري كامل** (Phase 2).
 *
 * العميل بيبعت { gameId, from, to, promo? } والسيرفر:
 *   1. يتأكد من المصادقة وأن المستخدم لاعب في المباراة.
 *   2. يتأكد إنها دوره (من حالة المباراة المخزنة).
 *   3. يحسب الساعة: لو وقت اللاعب خلص → خسارة بالوقت (فورًا).
 *   4. يتحقق من قانونية النقلة بمحرك الشطرنج نفسه (lib/games/chess/engine) —
 *      أي نقلة غير قانونية ترفض — والعميل مبيكتبش على chess_games أبدًا.
 *   5. يطبّق النقلة ويحدّث الحالة والساعات + increment.
 *   6. كش مات/حصر → chess_finish_game (تطبيق Elo على السيرفر).
 *
 * الكتابة بـ service-role (بعد التحقق اليدوي من المشاركة) — RLS يمنع العميل.
 */
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  legalMoves, makeMove, status,
  type GameState, type PieceType,
} from "@/lib/games/chess/engine";

export const dynamic = "force-dynamic";

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type GameRow = {
  id: string;
  white: string;
  black: string;
  category: string;
  increment_seconds: number;
  rated: boolean;
  status: "active" | "finished" | "aborted";
  state: GameState;
  moves: { from: number; to: number; promo?: string | null }[];
  white_ms: number;
  black_ms: number;
  last_move_at: string;
  result: "white" | "black" | "draw" | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "سجّل الدخول الأول.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const gameId = typeof (body as { gameId?: unknown } | null)?.gameId === "string" ? (body as { gameId: string }).gameId : "";
  const from = Number((body as { from?: unknown } | null)?.from);
  const to = Number((body as { to?: unknown } | null)?.to);
  const promo = typeof (body as { promo?: unknown } | null)?.promo === "string" ? (body as { promo: string }).promo : undefined;
  if (!gameId || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) {
    return NextResponse.json({ ok: false, error: "بيانات النقلة غير صالحة.", code: "INVALID_MOVE" }, { status: 400 });
  }

  const svc = serviceClient();
  const { data: game, error: loadErr } = await svc
    .from("chess_games")
    .select("id, white, black, category, increment_seconds, rated, status, state, moves, white_ms, black_ms, last_move_at, result")
    .eq("id", gameId)
    .single();

  if (loadErr || !game) {
    return NextResponse.json({ ok: false, error: "المباراة غير موجودة.", code: "GAME_NOT_FOUND" }, { status: 404 });
  }
  const g = game as GameRow;
  if (g.status !== "active") {
    return NextResponse.json({ ok: false, error: "المباراة انتهت.", code: "GAME_OVER" }, { status: 409 });
  }
  const isWhite = user.id === g.white;
  const isBlack = user.id === g.black;
  if (!isWhite && !isBlack) {
    return NextResponse.json({ ok: false, error: "مش لاعب في المباراة دي.", code: "NOT_PLAYER" }, { status: 403 });
  }
  const myColor = isWhite ? "w" : "b";
  if (g.state?.turn !== myColor) {
    return NextResponse.json({ ok: false, error: "مش دورك لسه.", code: "NOT_YOUR_TURN" }, { status: 409 });
  }
  if (!Array.isArray(g.state?.board) || g.state.board.length !== 64) {
    return NextResponse.json({ ok: false, error: "حالة المباراة تالفة.", code: "CORRUPT_STATE" }, { status: 500 });
  }

  // الساعة — لو وقت اللاعب خلص قبل النقلة، خسارة بالوقت فورًا
  const elapsedMs = Date.now() - new Date(g.last_move_at).getTime();
  const moverMs = Math.max(0, (isWhite ? g.white_ms : g.black_ms) - elapsedMs);
  if (moverMs <= 0) {
    const result = isWhite ? "black" : "white";
    await svc.rpc("chess_finish_game", { p_game_id: g.id, p_result: result, p_reason: "timeout" });
    return NextResponse.json({ ok: true, finished: true, result, reason: "timeout" });
  }

  // التحقق من قانونية النقلة بمحرك الشطرنج — المصدر الوحيد للحقيقة
  const legal = legalMoves(g.state).filter((m) => m.from === from && m.to === to);
  if (legal.length === 0) {
    return NextResponse.json({ ok: false, error: "نقلة غير قانونية.", code: "ILLEGAL_MOVE" }, { status: 400 });
  }
  const wantedPromo = (promo as PieceType | undefined) ?? "q";
  const move = legal.find((m) => m.promo === wantedPromo) ?? legal[0];

  const next = makeMove(g.state, move);
  const nextStatus = status(next);
  const newMoverMs = moverMs + g.increment_seconds * 1000;

  const finish = async (result: "white" | "black" | "draw", reason: string) => {
    await svc.rpc("chess_finish_game", { p_game_id: g.id, p_result: result, p_reason: reason });
    return NextResponse.json({ ok: true, finished: true, result, reason });
  };

  if (nextStatus === "checkmate") {
    return finish(isWhite ? "white" : "black", "checkmate");
  }
  if (nextStatus === "stalemate") {
    return finish("draw", "stalemate");
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await svc
    .from("chess_games")
    .update({
      state: next,
      moves: [...(Array.isArray(g.moves) ? g.moves : []), { from, to, promo: move.promo ?? null }],
      ...(isWhite ? { white_ms: newMoverMs } : { black_ms: newMoverMs }),
      last_move_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", g.id);

  if (updErr) {
    return NextResponse.json({ ok: false, error: "تعذر تسجيل النقلة.", code: "UPDATE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, finished: false });
}
