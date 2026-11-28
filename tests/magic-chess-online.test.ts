/**
 * عقد Magic Chess Online — Phase 2 (Master Spec) — static:
 *   - db/125: chess_ratings / chess_games / chess_queue + RLS + RPCs أمنية.
 *   - Elo K=32 لكل فئة وقت — Rating منفصل bullet/blitz/rapid/classical.
 *   - /api/chess/move: تحقق سيرفري بمحرك الشطرنج + service-role + ساعات.
 *   - صفحة أونلاين: matchmaking + poll + استسلام + claim_timeout.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { TIME_CONTROLS, formatClock, remainingMs, type ChessGameRow } from "@/lib/games/chess/online";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "125-chess-online.sql"), "utf8").replace(/\r\n/g, "\n");
const moveRoute = readFileSync(join(root, "app", "api", "chess", "move", "route.ts"), "utf8").replace(/\r\n/g, "\n");
const onlinePage = readFileSync(join(root, "app", "games", "chess", "online", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const chessPage = readFileSync(join(root, "app", "games", "chess", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("db/125 — الجداول والحماية", () => {
  it("الجداول الثلاثة موجودة", () => {
    for (const t of ["public.chess_ratings", "public.chess_games", "public.chess_queue"]) {
      expect(sql).toContain(`create table if not exists ${t}`);
    }
  });

  it("RLS: rating قراءة للمالك · مباراة قراءة للاعبين · الطابور RPCs بس", () => {
    expect(sql).toContain("alter table public.chess_ratings enable row level security");
    expect(sql).toContain("alter table public.chess_games enable row level security");
    expect(sql).toContain("alter table public.chess_queue enable row level security");
    expect(sql).toContain("create policy \"chess_ratings_owner_read\" on public.chess_ratings");
    expect(sql).toContain("create policy \"chess_games_players_read\" on public.chess_games");
    // chess_queue: RLS مفعّل بدون أي policy — الوصول فقط عبر security definer
    expect(sql).not.toMatch(/create policy[^;]*on public\.chess_queue/);
  });

  it("إنهاء المباراة للسيرفر بس — revoked من public/anonymous + service_role فقط", () => {
    expect(sql).toContain("revoke execute on function public.chess_finish_game(uuid, text, text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.chess_finish_game(uuid, text, text) to service_role");
  });

  it("matchmaking: ألوان عشوائية + تنظيف طابور يتيم + إعادة اتصال", () => {
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("interval '3 minutes'");
    expect(sql).toContain("random() < 0.5");
    // إعادة الاتصال: مباراة شغالة ترجّع قبل التسجيل
    expect(sql).toContain("g.status = 'active' and (g.white = uid or g.black = uid)");
  });

  it("claim_timeout بيتحقق بالحساب — مفيش إنهاء لو لسه وقت", () => {
    expect(sql).toContain("return 'not_expired'");
    expect(sql).toContain("'timeout'");
  });

  it("حالة ابتدائية متوافقة مع محركنا — 64 مربع ودور الأبيض", () => {
    expect(sql).toContain("create or replace function public.chess_initial_state()");
    expect(sql).toContain("'turn', 'w'");
  });
});

describe("فئات الوقت (المواصفة)", () => {
  it("٤ فئات بقيم ثابتة — bullet 2+1 · blitz 5+0 · rapid 10+5 · classical 30+0", () => {
    expect(TIME_CONTROLS.map((t) => t.category)).toEqual(["bullet", "blitz", "rapid", "classical"]);
    expect(TIME_CONTROLS.find((t) => t.category === "bullet")).toMatchObject({ initialSeconds: 120, incrementSeconds: 1 });
    expect(TIME_CONTROLS.find((t) => t.category === "blitz")).toMatchObject({ initialSeconds: 300, incrementSeconds: 0 });
    expect(TIME_CONTROLS.find((t) => t.category === "rapid")).toMatchObject({ initialSeconds: 600, incrementSeconds: 5 });
    expect(TIME_CONTROLS.find((t) => t.category === "classical")).toMatchObject({ initialSeconds: 1800, incrementSeconds: 0 });
  });

  it("الساعة: تنسيق وعدّ تنازلي من last_move_at لمن عليه الدور بس", () => {
    expect(formatClock(65_400)).toBe("1:06");
    const g = {
      status: "active", turn_used_below: undefined,
      white_ms: 60_000, black_ms: 60_000,
      last_move_at: new Date(Date.now() - 5000).toISOString(),
      state: { turn: "w" },
    } as unknown as ChessGameRow;
    const rem = remainingMs(g, Date.now());
    expect(rem.white).toBeLessThanOrEqual(55_000);
    expect(rem.white).toBeGreaterThan(50_000);
    expect(rem.black).toBe(60_000); // مش دوره — ساعته واقفة
  });
});

describe("/api/chess/move — تحقق سيرفري", () => {
  it("بيستخدم محرك الشطرنج + service-role + يرفض غير اللاعبين", () => {
    expect(moveRoute).toContain("legalMoves(g.state)");
    expect(moveRoute).toContain("makeMove(g.state, move)");
    expect(moveRoute).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(moveRoute).toContain("NOT_PLAYER");
    expect(moveRoute).toContain("ILLEGAL_MOVE");
    expect(moveRoute).toContain("NOT_YOUR_TURN");
  });

  it("الساعات سيرفرية: خصم المنقضي + increment + خسارة بالوقت", () => {
    expect(moveRoute).toContain("last_move_at");
    expect(moveRoute).toContain("increment_seconds * 1000");
    expect(moveRoute).toContain('"timeout"');
    expect(moveRoute).toContain('rpc("chess_finish_game"');
  });

  it("كش مات وحصر بينهوا المباراة على السيرفر", () => {
    expect(moveRoute).toContain('finish(isWhite ? "white" : "black", "checkmate")');
    expect(moveRoute).toContain('finish("draw", "stalemate")');
  });
});

describe("صفحة أونلاين", () => {
  it("matchmaking عبر RPC + poll + استسلام + claim timeout", () => {
    expect(onlinePage).toContain('rpc("chess_join_queue"');
    expect(onlinePage).toContain('rpc("chess_leave_queue"');
    expect(onlinePage).toContain('rpc("chess_resign"');
    expect(onlinePage).toContain('rpc("chess_claim_timeout"');
    expect(onlinePage).toContain('fetch("/api/chess/move"');
  });

  it("الرقعة بنفس عقد اللوحة الثابتة والألوان", () => {
    expect(onlinePage).toContain("h-[57px] w-[57px]");
    expect(onlinePage).toContain("!bg-[#a3c98a]");
    expect(onlinePage).toContain("!bg-[#d98d7c]");
    expect(onlinePage).toContain("boardThemeById");
  });

  it("صفحة الشطرنج فيها مدخل أونلاين", () => {
    expect(chessPage).toContain('href="/games/chess/online"');
  });
});
