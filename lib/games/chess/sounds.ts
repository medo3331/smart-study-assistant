/**
 * Magic Chess — أصوات اللعب عبر Web Audio API.
 *
 * بدون أي ملفات صوتية — نغمات مركبة من مذبذبات قصيرة (خفيفة جدًا).
 * الـ AudioContext بيتعمل lazy عند أول إيماءة مستخدم (سياسة المتصفحات)،
 * وأي فشل بيتجاهل بصمت — الصوت مش شرط للعب.
 */

export type SoundKind = "move" | "capture" | "check" | "win" | "lose";

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** نغمة واحدة: تردد + مدة + شكل موجة */
function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain = 0.08): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + at);
  osc.stop(c.currentTime + at + dur);
}

/** يشغّل صوت حدث الشطرنج — enabled من إعدادات اللاعب */
export function playSound(kind: SoundKind, enabled: boolean): void {
  if (!enabled) return;
  const c = audioCtx();
  if (!c) return;
  try {
    switch (kind) {
      case "move":
        tone(c, 220, 0, 0.08, "sine");
        break;
      case "capture":
        tone(c, 140, 0, 0.14, "triangle", 0.11);
        break;
      case "check":
        tone(c, 660, 0, 0.09, "square", 0.06);
        tone(c, 660, 0.12, 0.09, "square", 0.06);
        break;
      case "win":
        tone(c, 523, 0, 0.12, "sine");
        tone(c, 659, 0.12, 0.12, "sine");
        tone(c, 784, 0.24, 0.2, "sine");
        break;
      case "lose":
        tone(c, 392, 0, 0.14, "sine");
        tone(c, 330, 0.14, 0.14, "sine");
        tone(c, 262, 0.28, 0.24, "sine");
        break;
    }
  } catch {
    /* الصوت مش حاجة حرجة */
  }
}
