"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";

/**
 * 🏃‍♂️ Magicly Run — اللعبة الرئيسية في Magicly Arcade.
 *
 * جري لا نهائي في ٣ حارات جوه عالم Magicly: نط، انزلاق، تغيير حارة،
 * جمع كوينز الجولة، Power-ups (درع + مغناطيس)، والسرعة بتزيد تدريجيًا.
 *
 * الشخصية مرسومة Canvas بشخصية Magicly (كاب + وش + جسم بحركة جري).
 * النتيجة بتتسجل مرة واحدة عبر arcade_submit_score('run') — السيرفر
 * بيحسب الـ XP (الواجهة ماتبعتش XP) وبيحدد المكافآت.
 */

type SubmitResult = { xp: number; level: number; best: number; is_record: boolean; coins: number; achievements: string[]; message: string };

const W = 420;
const H = 640;
const LANE_X = [110, 210, 310]; // مراكز الحارات الثلاثة
const GROUND_Y = 540;

type Obstacle = {
  x: number; y: number; w: number; h: number;
  kind: "barrier" | "overhead" | "block";
  lane: number;
};
type Coin = { x: number; y: number; r: number; taken: boolean };
type Power = { x: number; y: number; kind: "shield" | "magnet"; taken: boolean };

type Phase = "ready" | "playing" | "over";

const MAGNET_RANGE = 130;

export default function RunPage() {
  const { supabase, session } = useAuthUser();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState({ score: 0, coins: 0 });
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [note, setNote] = useState("");
  const submitted = useRef(false);

  // حالة الجولة — refs عشان حلقة الرسم ما توجّعش الريندر
  const state = useRef({
    lane: 1,
    px: LANE_X[1], // موضع سلس أفقي (بنطّف نحو مركز الحارة)
    yAir: 0, // الارتفاع أثناء النط
    vy: 0, // سرعة النط
    sliding: 0, // عدّاد فريمات الانزلاق
    speed: 4,
    frame: 0,
    distance: 0,
    coins: 0,
    score: 0,
    shield: false,
    magnet: 0, // عدّاد فريمات المغناطيس
    obstacles: [] as Obstacle[],
    coinsArr: [] as Coin[],
    powers: [] as Power[],
    nextSpawn: 60,
    shake: 0,
  });

  const reset = useCallback(() => {
    const s = state.current;
    s.lane = 1; s.px = LANE_X[1]; s.yAir = 0; s.vy = 0; s.sliding = 0; s.speed = 4; s.frame = 0;
    s.distance = 0; s.coins = 0; s.score = 0;
    s.shield = false; s.magnet = 0;
    s.obstacles = []; s.coinsArr = []; s.powers = [];
    s.nextSpawn = 60; s.shake = 0;
    submitted.current = false;
    setResult(null);
    setHud({ score: 0, coins: 0 });
  }, []);

  const start = () => { reset(); setPhase("playing"); };

  // تسجيل النتيجة عند النهاية — مرة واحدة
  const finish = useCallback(async (score: number) => {
    if (submitted.current) return;
    submitted.current = true;
    setPhase("over");
    if (!supabase || session.status !== "ready") return;
    const { data, error } = await supabase.rpc("arcade_submit_score", {
      p_game: "run", p_score: score, p_won: false,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) setNote(error.message);
    else if (row) setResult(row as SubmitResult);
  }, [supabase, session.status]);

  // تحكم الكيبورد
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      const s = state.current;
      if (e.key === "ArrowLeft" && s.lane > 0) s.lane--;
      else if (e.key === "ArrowRight" && s.lane < 2) s.lane++;
      else if ((e.key === "ArrowUp" || e.key === " ") && s.vy === 0 && s.sliding === 0) s.vy = -13;
      else if (e.key === "ArrowDown" && s.vy === 0) s.sliding = 30;
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // حلقة اللعبة
  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const collide = null; // الاصطدام بيحسب جوا اللوب مباشرة
    void collide;

    const loop = () => {
      const s = state.current;
      s.frame++;
      s.speed = Math.min(11, s.speed + 0.0016);
      s.distance += s.speed * 0.1;
      s.score = Math.floor(s.distance) + s.coins * 10;
      if (s.magnet > 0) s.magnet--;
      if (s.sliding > 0) s.sliding--;
      if (s.shake > 0) s.shake--;

      // فيزياء النط — قفزة واحدة في الهوا
      if (s.vy !== 0 || s.yAir > 0) {
        s.yAir += s.vy;
        s.vy += 0.7;
        if (s.yAir <= 0) { s.yAir = 0; s.vy = 0; }
      }

      // انزياح سلس نحو مركز الحارة المختارة
      s.px += (LANE_X[s.lane] - s.px) * 0.3;

      // توليد العقبات والكوينز
      if (s.frame >= s.nextSpawn) {
        s.nextSpawn = s.frame + Math.max(28, 70 - Math.floor(s.speed * 3));
        spawnPattern(s);
      }

      // تحريك العناصر نازلة
      for (const o of s.obstacles) o.y += s.speed;
      for (const c of s.coinsArr) c.y += s.speed;
      for (const p of s.powers) p.y += s.speed;
      s.obstacles = s.obstacles.filter((o) => o.y < H + 40);
      s.coinsArr = s.coinsArr.filter((c) => c.y < H + 40 && !c.taken);
      s.powers = s.powers.filter((p) => p.y < H + 40 && !p.taken);

      // مغناطيس — الكوينز القريبة بتتسحب للاعب
      const px = s.px;
      if (s.magnet > 0) {
        for (const c of s.coinsArr) {
          if (Math.abs(c.y - GROUND_Y) < MAGNET_RANGE && Math.abs(c.x - px) < MAGNET_RANGE) {
            c.x += (px - c.x) * 0.15;
            c.y += (GROUND_Y - 40 - c.y) * 0.15;
          }
        }
      }

      // جمع الكوينز
      const hitY = GROUND_Y - (s.yAir ?? 0) - 40;
      for (const c of s.coinsArr) {
        if (!c.taken && Math.abs(c.x - px) < 34 && Math.abs(c.y - hitY) < 44) {
          c.taken = true;
          s.coins++;
        }
      }
      for (const p of s.powers) {
        if (!p.taken && Math.abs(p.x - px) < 34 && Math.abs(p.y - hitY) < 44) {
          p.taken = true;
          if (p.kind === "shield") s.shield = true;
          else s.magnet = 420; // ~٧ ثواني
        }
      }

      // الاصطدام
      const playerTop = hitY - (s.sliding > 0 ? 14 : 44);
      const playerBottom = hitY + (s.sliding > 0 ? 4 : 8);
      for (const o of s.obstacles) {
        const sameLane = Math.abs(o.x - px) < (o.w + 24) / 2;
        if (!sameLane) continue;
        const overlap = o.y + o.h > playerTop && o.y < playerBottom;
        if (!overlap) continue;
        // النط بينقز فوق الحاجز المنخفض، والانزلاق بينجّي من البار العالي
        const jumpedOver = (s.yAir ?? 0) > o.h + 18 && o.kind !== "overhead";
        const slidUnder = s.sliding > 0 && o.kind === "overhead";
        if (jumpedOver || slidUnder) continue;
        if (s.shield) { s.shield = false; o.y = H + 999; s.shake = 12; }
        else { void finish(s.score); raf = 0; return; }
      }

      draw(ctx, s);
      if (s.frame % 8 === 0) setHud({ score: s.score, coins: s.coins });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, finish]);

  return (
    <PageShell
      eyebrow="Magicly Run"
      title="🏃‍♂️ ماجِك رَن"
      lede="اجرى في عالم Magicly — نط وانزلق وغيّر حارة، اجمع كوينز الجولة، والنتيجة بتتحول XP في مستواك."
      action={
        phase === "over" || phase === "ready" ? (
          <button className="btn btn-marker text-sm" onClick={start}>{phase === "over" ? "جولة جديدة" : "ابدأ الجري"}</button>
        ) : (
          <span className="tag">⭐ {hud.score.toLocaleString("en")} · 🪙 {hud.coins}</span>
        )
      }
    >
      {note && <p className="text-sm text-red-600">{note}</p>}

      <div className="mx-auto w-full max-w-md" dir="ltr">
        <div className="relative overflow-hidden rounded-2xl border-2 border-rule shadow-md">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="block h-auto w-full touch-none"
            style={{ aspectRatio: `${W}/${H}` }}
          />
          {phase !== "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/85 p-6 text-center">
              {phase === "over" && (
                <>
                  <h2 className="h2 font-extrabold">🛑 خلصت الجولة!</h2>
                  <p className="text-lg font-bold text-marker">النتيجة: {hud.score.toLocaleString("en")} · كوينز: {hud.coins}</p>
                  {result && (
                    <p className="text-sm">
                      <strong>+{result.xp} XP</strong> · مستوى {result.level}
                      {result.is_record && <> · 🎉 رقم قياسي!</>}
                      {result.coins > 0 && <> · +{result.coins} 🪙</>}
                    </p>
                  )}
                </>
              )}
              {phase === "ready" && (
                <>
                  <h2 className="h2 font-extrabold">🏃‍♂️ Magicly Run</h2>
                  <p className="text-sm text-ink-soft">الأسهم للحركة · مسافة/فوق للنط · تحت للانزلاق</p>
                </>
              )}
              <button className="btn btn-marker" onClick={start}>{phase === "over" ? "جولة جديدة" : "ابدأ الجري"}</button>
            </div>
          )}
        </div>
      </div>

      {/* تحكم اللمس للموبايل */}
      {phase === "playing" && (
        <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2" dir="ltr">
          <TouchBtn label="◀" onPress={() => { const s = state.current; if (s.lane > 0) s.lane--; }} />
          <TouchBtn label="▲ نط" onPress={() => { const s = state.current; if (s.vy === 0 && s.sliding === 0) s.vy = -13; }} />
          <TouchBtn label="▼ زحف" onPress={() => { const s = state.current; if (s.vy === 0) s.sliding = 30; }} />
          <TouchBtn label="▶" onPress={() => { const s = state.current; if (s.lane < 2) s.lane++; }} />
        </div>
      )}

      <div className="grid gap-2 text-xs text-ink-soft sm:grid-cols-3">
        <p>⭐ النتيجة = المسافة + (كوينز الجولة × ١٠) — بتتحول XP من السيرفر</p>
        <p>🛡️ الدرع بيمتص ضربة واحدة · 🧲 المغناطيس بيسحب الكوينز</p>
        <p>السرعة بتزيد تدريجيًا — ركّز على الحارة الفاضية</p>
      </div>
    </PageShell>
  );
}

function TouchBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      className="sheet-card py-3 text-lg font-extrabold active:bg-marker/10"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* توليد الأنماط — عقبات + صفوف كوينز + Power-ups                      */
/* ------------------------------------------------------------------ */

function spawnPattern(s: { obstacles: Obstacle[]; coinsArr: Coin[]; powers: Power[]; speed: number; frame: number }) {
  const roll = Math.random();
  const safeLane = Math.floor(Math.random() * 3);

  if (roll < 0.55) {
    // عقبة في حارة أو اتنين — دايمًا في حارة فاضية للنجاة
    const kinds: Obstacle["kind"][] = ["barrier", "overhead", "block"];
    const n = Math.random() < 0.35 ? 2 : 1;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, n);
    for (const lane of lanes) {
      const kind = kinds[Math.floor(Math.random() * 3)];
      const spec = kind === "barrier" ? { w: 56, h: 26 } : kind === "overhead" ? { w: 70, h: 18 } : { w: 52, h: 62 };
      s.obstacles.push({ lane, x: LANE_X[lane], y: -70, w: spec.w, h: spec.h, kind });
    }
    // كوينز في الحارة الآمنة
    for (let i = 0; i < 3; i++) s.coinsArr.push({ x: LANE_X[safeLane], y: -70 - i * 34, r: 9, taken: false });
  } else if (roll < 0.85) {
    // صف كوينز كامل في حارة
    const lane = Math.floor(Math.random() * 3);
    for (let i = 0; i < 5; i++) s.coinsArr.push({ x: LANE_X[lane], y: -70 - i * 34, r: 9, taken: false });
  } else {
    // Power-up نادر
    const kind: Power["kind"] = Math.random() < 0.5 ? "shield" : "magnet";
    s.powers.push({ x: LANE_X[safeLane], y: -70, kind, taken: false });
  }
}

/* ------------------------------------------------------------------ */
/* الرسم — الطريق + شخصية Magicly + العناصر                            */
/* ------------------------------------------------------------------ */

function draw(ctx: CanvasRenderingContext2D, s: {
  px: number; lane: number; yAir: number; vy: number; sliding: number; speed: number;
  frame: number; obstacles: Obstacle[]; coinsArr: Coin[]; powers: Power[];
  shield: boolean; magnet: number; shake: number;
}) {
  ctx.save();
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);

  // السماء والأرض — عالم Magicly
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#7c3aed"); // بنفسجي ماجِك
  sky.addColorStop(1, "#c4b5fd");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // نجوم / جزيئات ماجِك
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 14; i++) {
    const sx = (i * 97 + (s.frame * 0.3)) % W;
    const sy = 30 + ((i * 53) % 160);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // الطريق — ٣ حارات بمنظور بسيط
  const road = ctx.createLinearGradient(0, GROUND_Y - 200, 0, H);
  road.addColorStop(0, "#4b5563");
  road.addColorStop(1, "#374151");
  ctx.fillStyle = road;
  ctx.fillRect(30, GROUND_Y - 200, W - 60, H - GROUND_Y + 200);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.lineDashOffset = -((s.frame * s.speed) % 48);
  for (const lx of [160, 260]) {
    ctx.beginPath();
    ctx.moveTo(lx, GROUND_Y - 200);
    ctx.lineTo(lx, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // حافة الطريق
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, GROUND_Y - 200, 30, H);
  ctx.fillRect(W - 30, GROUND_Y - 200, 30, H);

  // الكوينز — دوائر ذهبية بلمعة
  for (const c of s.coinsArr) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(c.x - 2.5, c.y - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // العقبات
  for (const o of s.obstacles) {
    if (o.y > H + 100) continue;
    if (o.kind === "barrier") {
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(o.x - o.w / 2, o.y, o.w, o.h);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 3; i++) ctx.fillRect(o.x - o.w / 2 + 6 + i * 18, o.y + 4, 8, o.h - 8);
    } else if (o.kind === "overhead") {
      // بار معلّق — انزلق تحته
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(o.x - o.w / 2, o.y, o.w, o.h);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(o.x - o.w / 2, o.y + o.h - 5, o.w, 5);
      ctx.fillStyle = "#78350f";
      ctx.fillRect(o.x - 4, o.y - 26, 8, 26);
      ctx.fillRect(o.x + o.w / 2 - 4, o.y - 26, 8, 26);
    } else {
      // بلوك عالي — لازم تغيّر حارة
      const g = ctx.createLinearGradient(o.x - o.w / 2, o.y, o.x + o.w / 2, o.y + o.h);
      g.addColorStop(0, "#334155");
      g.addColorStop(1, "#0f172a");
      ctx.fillStyle = g;
      ctx.fillRect(o.x - o.w / 2, o.y, o.w, o.h);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x - o.w / 2, o.y, o.w, o.h);
    }
  }

  // Power-ups
  for (const p of s.powers) {
    const bob = Math.sin(s.frame * 0.12) * 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 15, 0, Math.PI * 2);
    ctx.fillStyle = p.kind === "shield" ? "rgba(59,130,246,0.25)" : "rgba(236,72,153,0.25)";
    ctx.fill();
    ctx.font = "20px serif";
    ctx.textAlign = "center";
    ctx.fillText(p.kind === "shield" ? "🛡️" : "🧲", p.x, p.y + bob + 7);
  }

  // شخصية Magicly — جري/نط/انزلاق
  drawRunner(ctx, s);

  // مؤشرات الـ Power-ups النشطة
  if (s.shield) {
    const px = s.px;
    ctx.strokeStyle = "rgba(59,130,246,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, GROUND_Y - (s.yAir ?? 0) - 44, 38, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawRunner(ctx: CanvasRenderingContext2D, s: {
  px: number; lane: number; yAir: number; vy: number; sliding: number; frame: number; speed: number;
}) {
  const px = s.px;
  const air = s.yAir;
  const sliding = s.sliding > 0;
  const baseY = GROUND_Y - air;
  const step = Math.sin(s.frame * 0.45) * (s.speed * 0.6);

  ctx.save();
  ctx.translate(px, baseY);

  // ظل
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 4, sliding ? 26 : 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (sliding) {
    // انزلاق — جسم منخفض
    ctx.fillStyle = "#7c3aed";
    roundRect(ctx, -22, -26, 44, 20, 8); // الجسم
    ctx.fillStyle = "#fcd34d";
    ctx.beginPath();
    ctx.arc(-24, -16, 10, 0, Math.PI * 2); // الرأس للأمام
    ctx.fill();
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(-34, -22, 16, 4); // الكاب
  } else {
    // الرجلين — حركة جري
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4, -34); ctx.lineTo(-10 + step, air > 0 ? -8 : 0);
    ctx.moveTo(4, -34); ctx.lineTo(10 - step, air > 0 ? -4 : 0);
    ctx.stroke();

    // الجسم — تدرّج ٣D بسيط
    const body = ctx.createLinearGradient(-12, -60, 12, -30);
    body.addColorStop(0, "#8b5cf6");
    body.addColorStop(1, "#5b21b6");
    ctx.fillStyle = body;
    roundRect(ctx, -13, -60, 26, 30, 9);

    // الرأس
    ctx.fillStyle = "#fcd34d";
    ctx.beginPath();
    ctx.arc(0, -72, 12, 0, Math.PI * 2);
    ctx.fill();
    // كاب Magicly
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.arc(0, -76, 12, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-14, -78, 28, 4);
    ctx.fillRect(6, -78, 16, 3); // المظلة
    // عيون
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(4, -71, 2, 0, Math.PI * 2);
    ctx.fill();

    // الدراعين
    ctx.strokeStyle = "#fcd34d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, -52); ctx.lineTo(-16 + step * 0.8, -38);
    ctx.moveTo(10, -52); ctx.lineTo(16 - step * 0.8, -38);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
