/**
 * اختبار الضغط قبل الرفع — Phase المحاضرة
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ ماشاسة FFmpeg باكك: المحرّك الحقيقي ماتحمّش​اطًاً.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  outputBytes: 10 * 1024 * 1024,
  execCalls: [] as string[][],
  deleted: [] as string[],
  loadCalls: 0,
  loadThrows: false,
  outputLadder: null as number[] | null,
}));

vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    on() {}
    async load() {
      h.loadCalls++;
      if (h.loadThrows) throw new Error("core_load_failed");
    }
    async writeFile() {}
    async exec(args: string[]) {
      if (h.outputLadder && h.outputLadder.length > 0) h.outputBytes = h.outputLadder.shift()!;
      h.execCalls.push(args);
      return 0;
    }
    async readFile() {
      return new Uint8Array(h.outputBytes);
    }
    async deleteFile(name: string) {
      h.deleted.push(name);
      return true;
    }
    terminate() {}
  },
}));

vi.mock("@ffmpeg/util", () => ({
  fetchFile: async () => new Uint8Array([1, 2, 3]),
  toBlobURL: async (url: string) => url,
}));

import {
  BITRATE_LADDER_KBPS,
  MAX_UPLOAD_BYTES,
  MP3_MIME,
  bitrateForDuration,
  compressLectureMedia,
  disposeCompressionEngine,
  getDeviceLimit,
  mp3Filename,
  needsCompression,
} from "../lecture-compression";

/** محاكاة navigator.deviceMemory */
function mockDeviceMemory(memory: number | undefined) {
  Object.defineProperty(navigator, "deviceMemory", {
    configurable: true,
    get: () => memory,
  });
}

/** محاكاة navigator.userAgent */
function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
}

const mb = (n: number) => n * 1024 * 1024;
const fileOf = (bytes: number, name = "lecture.mp4", type = "video/mp4") => {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};
const durationOf = (seconds: number) => async () => seconds;

beforeEach(() => {
  h.outputBytes = 10 * 1024 * 1024;
  h.execCalls = [];
  h.deleted = [];
  h.loadCalls = 0;
  h.loadThrows = false;
  h.outputLadder = null;
});

afterEach(async () => {
  await disposeCompressionEngine();
});

describe("القرارة — الحد والعدادة", () => {
  it("✅ 45 MB تكسريان أسطر من المعاجة", () => {
    expect(needsCompression({ type: "video/mp4", size: mb(45) })).toBe(false);
    expect(needsCompression({ type: "video/mp4", size: mb(44) })).toBe(false);
    expect(needsCompression({ type: "video/mp4", size: 0 })).toBe(false);
  });

  it("✅ أكبر من 45 MB يحتاج ضغط", () => {
    expect(needsCompression({ type: "video/mp4", size: mb(45) + 1 })).toBe(true);
    expect(needsCompression({ type: "video/mp4", size: mb(51) })).toBe(true);
  });

  it("✅ المعادات: 64→48→32→24 حسب المدة", () => {
    expect(bitrateForDuration(30 * 60)).toBe(64);
    expect(bitrateForDuration(60 * 60)).toBe(64);
    expect(bitrateForDuration(61 * 60)).toBe(48);
    expect(bitrateForDuration(120 * 60)).toBe(48);
    expect(bitrateForDuration(121 * 60)).toBe(32);
    expect(bitrateForDuration(180 * 60)).toBe(32);
    expect(bitrateForDuration(181 * 60)).toBe(32);
    expect(bitrateForDuration(99999 * 60)).toBe(32); // above 2h -> floor rung
  });

  it("✅ اسم الملف يُمّل واحد", () => {
    expect(mp3Filename("lecture.mp4")).toBe("lecture.mp3");
    expect(mp3Filename("my talk.webm")).toBe("my talk.mp3");
    expect(mp3Filename("noext")).toBe("noext.mp3");
  });

  it("✅ سلّم معادات متنازل", () => {
    expect([...BITRATE_LADDER_KBPS]).toEqual([64, 48, 32]);
  });
});

describe("الضغط — المحرّك", () => {
  it("✅ ملف صغير → مافيش تمسك FFmpeg ولا ضغط", async () => {
    const small = fileOf(mb(10), "small.mp3", "audio/mpeg");
    const result = await compressLectureMedia(small, undefined, durationOf(10));

    expect(result.file).toBe(small);
    expect(result.finalBytes).toBe(mb(10));
    expect(h.loadCalls).toBe(0);
    expect(h.execCalls).toHaveLength(0);
  });

  it("✅ ملف أكبر → بيطلمص صوت MP3 mono من غير فيديو", async () => {
    await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));

    const args = h.execCalls[0];
    expect(args).toContain("-vn");
    expect(args[args.indexOf("-ac") + 1]).toBe("1");      // mono
    expect(args).toContain("-b:a");
    expect(args[args.indexOf("-b:a") + 1]).toBe("64k");   // 30min -> 64k
    expect(h.loadCalls).toBe(1);
  });

  it("✅ نتاج داخل الحد → يستأن للرفع", async () => {
    h.outputBytes = mb(18);
    const result = await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));

    expect(result.file.type).toBe(MP3_MIME);
    expect(result.file.name).toBe("lecture.mp3");
    expect(result.finalBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(result.retries).toBe(0);
    expect(result.originalBytes).toBe(mb(51));
  });

  it("✅ نتاج أكبر → جرّب بمعدد أخفص حتى يدخل", async () => {
    // ⚠️ 50 > 45 و 46 > 45 و 30 <= 45 → ثلاث جربت إعادة المعادة.
    h.outputLadder = [mb(50), mb(46), mb(30)];
    const result = await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));

    expect(result.bitrateKbps).toBe(32);
    expect(result.retries).toBe(2);
    expect(result.finalBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(h.execCalls).toHaveLength(3);
  });

  mockDeviceMemory(16); // 120MB device limit
  it("❌ لم يدخل بعد أقل معادة → رفع برسالة", async () => {
    h.outputBytes = mb(300);
    await expect(
      compressLectureMedia(fileOf(mb(50)), undefined, durationOf(30 * 60)),
    ).rejects.toThrow("still_too_large");
  });

  it("❌ فشل تحميل FFmpeg بيرتهي للطالب", async () => {
    h.loadThrows = true;
    await expect(
      compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60)),
    ).rejects.toThrow();
  });

  mockDeviceMemory(16); // 120MB device limit
  it("❌ لم نرفع الملف الأصلي أبدًاً", async () => {
    h.outputBytes = mb(300);
    await expect(
      compressLectureMedia(fileOf(mb(50)), undefined, durationOf(30 * 60)),
    ).rejects.toThrow();
    // ⚠️ the original is never "returned for upload" on failure.
    expect(h.execCalls.length).toBeGreaterThan(0);
  });

  it("✅ النظاف الافتراضي من النظام", async () => {
    await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));
    expect(h.deleted).toContain("input.media");
    expect(h.deleted).toContain("output.mp3");
  });

  it("✅ بينشر نسبة تقدم", async () => {
    const seen: number[] = [];
    await compressLectureMedia(fileOf(mb(51)), (p) => seen.push(p.ratio), durationOf(30 * 60));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("getDeviceLimit — حدود الجهاز", () => {
  afterEach(() => {
    delete (navigator as any).deviceMemory;
    delete (navigator as any).userAgent;
  });

  it("RAM ≤ 2GB → 40MB", () => {
    mockDeviceMemory(2);
    expect(getDeviceLimit()).toBe(40 * 1024 * 1024);
  });

  it("RAM ≤ 4GB → 60MB", () => {
    mockDeviceMemory(4);
    expect(getDeviceLimit()).toBe(60 * 1024 * 1024);
  });

  it("RAM ≤ 8GB → 100MB", () => {
    mockDeviceMemory(8);
    expect(getDeviceLimit()).toBe(100 * 1024 * 1024);
  });

  it("RAM > 8GB → 120MB", () => {
    mockDeviceMemory(16);
    expect(getDeviceLimit()).toBe(120 * 1024 * 1024);
  });

  it("no deviceMemory + iOS UA → 60MB", () => {
    delete (navigator as any).deviceMemory;
    mockUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)");
    expect(getDeviceLimit()).toBe(60 * 1024 * 1024);
  });

  it("no deviceMemory + Android UA → 80MB", () => {
    delete (navigator as any).deviceMemory;
    mockUserAgent("Mozilla/5.0 (Linux; Android 10; SM-G973F)");
    expect(getDeviceLimit()).toBe(80 * 1024 * 1024);
  });

  it("no deviceMemory + desktop UA → 120MB", () => {
    delete (navigator as any).deviceMemory;
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(getDeviceLimit()).toBe(120 * 1024 * 1024);
  });
});

describe("needsCompression مع حدود الجهاز", () => {
  afterEach(() => {
    delete (navigator as any).deviceMemory;
    delete (navigator as any).userAgent;
  });

  it("ملف أكبر من حد الجهاز لا يحتاج ضغط (سيظهر خطأ في الواجهة)", () => {
    mockDeviceMemory(2); // 40MB limit
    const largeFile = { size: 50 * 1024 * 1024, type: "audio/wav" } as File;
    expect(needsCompression(largeFile)).toBe(false);
  });

  it("ملف أصغر من حد الجهاز يحتاج ضغط إذا أكبر من 45MB", () => {
    mockDeviceMemory(16); // 120MB limit
    const file = { size: 50 * 1024 * 1024, type: "audio/wav" } as File;
    expect(needsCompression(file)).toBe(true);
  });

  it("MP3 كبير من حد الجهاز لا يحتاج ضغط (مستثنى)", () => {
    mockDeviceMemory(2); // 40MB limit
    const largeMP3 = { size: 50 * 1024 * 1024, type: "audio/mpeg" } as File;
    expect(needsCompression(largeMP3)).toBe(false);
  });
});

