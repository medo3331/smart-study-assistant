/**
 * Magic Chess Online — Phase 2 (Master Spec).
 *
 * فئات الوقت (نفس روح Bullet/Blitz/Rapid/Classical من المواصفة) + أنواع
 * صفوف المباراة والـ Rating — مشتركة بين الواجهة وroute النقلات.
 *
 * pure — بدون React.
 */

export type ChessCategory = "bullet" | "blitz" | "rapid" | "classical";

export type TimeControl = {
  category: ChessCategory;
  label: string;
  /** دقائق + زمن إضافي لكل نقلة (increment) */
  initialSeconds: number;
  incrementSeconds: number;
};

/** فئات الوقت المعتمدة — قيمها ثابتة عقد مع db/125 والاختبارات */
export const TIME_CONTROLS: readonly TimeControl[] = [
  { category: "bullet", label: "سريعة جدًا ⚡ 2+1", initialSeconds: 120, incrementSeconds: 1 },
  { category: "blitz", label: "برق 🔥 5+0", initialSeconds: 300, incrementSeconds: 0 },
  { category: "rapid", label: "سريعة ⏱️ 10+5", initialSeconds: 600, incrementSeconds: 5 },
  { category: "classical", label: "كلاسيك 🧠 30+0", initialSeconds: 1800, incrementSeconds: 0 },
];

export function timeControlByCategory(c: string): TimeControl | undefined {
  return TIME_CONTROLS.find((t) => t.category === c);
}

export const CATEGORY_NAMES: Record<ChessCategory, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
};

/** صف الـ Rating للاعب — من chess_ratings */
export type ChessRatingsRow = {
  bullet: number;
  blitz: number;
  rapid: number;
  classical: number;
  wins: number;
  losses: number;
  draws: number;
};

/** صف مباراة أونلاين — من chess_games (db/125) */
export type ChessGameRow = {
  id: string;
  white: string;
  black: string;
  category: ChessCategory;
  initial_seconds: number;
  increment_seconds: number;
  rated: boolean;
  status: "active" | "finished" | "aborted";
  state: {
    board: ({ t: string; c: "w" | "b" } | null)[];
    turn: "w" | "b";
    castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
    ep: number | null;
  };
  moves: { from: number; to: number; promo?: string | null }[];
  white_ms: number;
  black_ms: number;
  last_move_at: string;
  result: "white" | "black" | "draw" | null;
  result_reason: string | null;
};

/** تنسيق ميلي ثانية إلى mm:ss للساعة */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** الوقت المتبقي الفعلي لمن عليه الدور — الساعة بتجري من last_move_at */
export function remainingMs(game: ChessGameRow, now: number): { white: number; black: number } {
  const elapsed = game.status === "active" ? Math.max(0, now - new Date(game.last_move_at).getTime()) : 0;
  const mover = game.state.turn;
  return {
    white: Math.max(0, (mover === "w" ? game.white_ms - elapsed : game.white_ms)),
    black: Math.max(0, (mover === "b" ? game.black_ms - elapsed : game.black_ms)),
  };
}
