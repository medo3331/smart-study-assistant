/**
 * اختبار تقسيم المحاضرة لأجزاء **صالحة** للتفريغ
 * ============================================================================
 *
 * ⛔ ما بتحمّلش FFmpeg باكك: المحرّك الحقيقي ماتحمّش‌اطًاً.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  /** حجم الملف اللي FFmpeg بيرجّعه في `readFile` (لأقسم 300 ثانية). */
  outputBytes: 1024 * 1024,
  /** المدّة المرجعية اللي `outputBytes` بتقيس عليها. */
  outputSeconds: 300,
  /** ملفات الـ FS الوهمية — اسم → بيانات. */
  files: new Map<string, Uint8Array>(),
  execCalls: [] as string[][],
  ffprobeCalls: [] as string[][],
  deleted: [] as string[],
  loadCalls: 0,
  loadThrows: false,
  /** مدّة الملف كما بيرجّعها ffprobe (null = فشل). */
  duration: 600 as number | null,
  /** كود خروج exec (0 = نجاح). */
  execExit: 0,
}));

vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    on() {}
    async load() {
      h.loadCalls++;
      if (h.loadThrows) throw new Error("core_load_failed");
    }
    async writeFile(name: string, data: Uint8Array) {
      h.files.set(name, data);
      return true;
    }
    async exec(args: string[]) {
      h.execCalls.push(args);
      if (h.execExit !== 0) return h.execExit;
      const out = args[args.length - 1];
      /* المحاكاة واقعية: حجم المخرج بيتناسب مع المدة المطلوبة
       * (`-t`)، فالتقسيم لنص المدة بيدي نص الحجم. */
      const tIndex = args.indexOf("-t");
      const seconds = tIndex === -1 ? 1 : Number(args[tIndex + 1]);
      const size = Math.max(
        1,
        Math.round((h.outputBytes * seconds) / h.outputSeconds),
      );
      h.files.set(out, new Uint8Array(size));
      return 0;
    }
    async ffprobe(args: string[]) {
      h.ffprobeCalls.push(args);
      if (h.duration === null) return 1;
      h.files.set("probe.txt", new TextEncoder().encode(String(h.duration)));
      return 0;
    }
    async readFile(name: string) {
      const data = h.files.get(name);
      if (!data) throw new Error(`no_such_file_${name}`);
      return data;
    }
    async deleteFile(name: string) {
      h.deleted.push(name);
      h.files.delete(name);
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
  AUDIO_BITRATE_KBPS,
  CHUNK_SECONDS,
  chunkLectureFile,
  chunkPartName,
  fileExtension,
  isSliceSafe,
  MAX_CHUNK_BYTES,
  MP3_MIME,
  needsAudioExtraction,
  SLICE_SAFE_EXTENSIONS,
  stripExtension,
} from "../lecture-chunking";
import { disposeCompressionEngine } from "../ffmpeg-engine";

const mb = (n: number) => n * 1024 * 1024;

/** ملف وهمي بالحجم المطلوب. */
const fileOf = (bytes: number, name = "lecture.webm", type = "video/webm") => {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

beforeEach(() => {
  h.outputBytes = 1024 * 1024;
  h.outputSeconds = 300;
  h.files = new Map();
  h.execCalls = [];
  h.ffprobeCalls = [];
  h.deleted = [];
  h.loadCalls = 0;
  h.loadThrows = false;
  h.duration = 600;
  h.execExit = 0;
});

afterEach(async () => {
  await disposeCompressionEngine();
});

describe("قواعد الصيغ — مين بيتقسم بأمان", () => {
  it("MP3 و AAC بس هم اللي بيتقسموا بـ slice مباشرة", () => {
    expect(SLICE_SAFE_EXTENSIONS).toEqual(["mp3", "aac"]);
    expect(isSliceSafe("lecture.mp3")).toBe(true);
    expect(isSliceSafe("lecture.aac")).toBe(true);
    expect(isSliceSafe("LECTURE.MP3")).toBe(true);
  });

  it("WebM/MP4/WAV/M4A بياخدوا مسار استخراج الصوت", () => {
    for (const name of [
      "lecture.webm",
      "lecture.mp4",
      "lecture.wav",
      "lecture.m4a",
      "lecture.flac",
      "lecture.ogg",
    ]) {
      expect(isSliceSafe(name)).toBe(false);
      expect(needsAudioExtraction(name)).toBe(true);
    }
  });

  it("needsAudioExtraction عكس isSliceSafe", () => {
    expect(needsAudioExtraction("a.mp3")).toBe(false);
    expect(needsAudioExtraction("a.aac")).toBe(false);
    expect(needsAudioExtraction("a.webm")).toBe(true);
  });

  it("fileExtension بتقرا الامتداد من غير حساسية للحالة", () => {
    expect(fileExtension("lecture.webm")).toBe("webm");
    expect(fileExtension("lecture.MP3")).toBe("mp3");
    expect(fileExtension("noext")).toBe("");
  });

  it("stripExtension بيشيل آخر امتداد بس", () => {
    expect(stripExtension("lecture.webm")).toBe("lecture");
    expect(stripExtension("my.lecture.v2.mp3")).toBe("my.lecture.v2");
    expect(stripExtension("noext")).toBe("noext");
  });

  it("chunkPartName بتحط رقم الجزء والامتداد في الآخر", () => {
    expect(chunkPartName("lecture.webm", 0)).toBe("lecture.part1.mp3");
    expect(chunkPartName("lecture.webm", 4)).toBe("lecture.part5.mp3");
    expect(chunkPartName("lecture.mp3", 1, "mp3")).toBe("lecture.part2.mp3");
  });
});

describe("المسار السريع — MP3 بدون FFmpeg", () => {
  it("بيقسّم الملف ل أجزاء وبيحافظ على الامتداد", async () => {
    const file = new File([new Uint8Array(mb(4))], "lecture.mp3", {
      type: "audio/mpeg",
    });
    const chunks = await chunkLectureFile(file);

    expect(chunks.length).toBe(2);
    expect(chunks[0].name).toBe("lecture.part1.mp3");
    expect(chunks[1].name).toBe("lecture.part2.mp3");
    expect(chunks.every((c) => c.file.size <= MAX_CHUNK_BYTES)).toBe(true);
  });

  it("مش بيحمّل FFmpeg خالص", async () => {
    const file = new File([new Uint8Array(mb(1))], "lecture.mp3", {
      type: "audio/mpeg",
    });
    await chunkLectureFile(file);
    expect(h.loadCalls).toBe(0);
    expect(h.execCalls.length).toBe(0);
  });

  it("ملف أصغر من الحد بيطلع part واحد بس", async () => {
    const file = new File([new Uint8Array(1000)], "lecture.mp3", {
      type: "audio/mpeg",
    });
    const chunks = await chunkLectureFile(file);
    expect(chunks.length).toBe(1);
    expect(chunks[0].file.size).toBe(1000);
  });

  it("بيبلّغ عن التقدّم", async () => {
    const file = new File([new Uint8Array(mb(2))], "lecture.mp3", {
      type: "audio/mpeg",
    });
    const seen: number[] = [];
    await chunkLectureFile(file, (p) => seen.push(p.ratio));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("المسار الآمن — WebM/MP4 بيتحوّلوا لصوت MP3", () => {
  it("بيستخرج الصوت بـ ffmpeg بإعدادات مظبوطة", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await chunkLectureFile(file);

    const extract = h.execCalls.find((c) => c.includes("-vn"));
    expect(extract).toBeDefined();
    expect(extract).toContain("-ac");
    expect(extract).toContain("1");
    expect(extract).toContain("-b:a");
    expect(extract).toContain(`${AUDIO_BITRATE_KBPS}k`);
  });

  it("بيقسّم الصوت لأجزاء MP3 صالحة بأسماء مرتّبة", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    const chunks = await chunkLectureFile(file);

    expect(chunks.length).toBe(2); // 600 ثانية ÷ 300
    expect(chunks[0].name).toBe("lecture.part1.mp3");
    expect(chunks[1].name).toBe("lecture.part2.mp3");
    expect(chunks.every((c) => c.file.type === MP3_MIME)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("بيستخدم -c copy عشان الإطارات تفضل مستقلة", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await chunkLectureFile(file);

    const split = h.execCalls.find((c) => c.includes("-c") && c.includes("copy"));
    expect(split).toBeDefined();
    expect(split).toContain("-ss");
    expect(split).toContain("-t");
  });

  it("بيقسّم بمدة CHUNK_SECONDS", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await chunkLectureFile(file);

    const split = h.execCalls.find((c) => c.includes("-c") && c.includes("copy"));
    expect(split).toContain(String(CHUNK_SECONDS));
  });

  it("بيقيس المدّة بـ ffprobe", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await chunkLectureFile(file);
    expect(h.ffprobeCalls.length).toBeGreaterThan(0);
  });

  it("بيقدّم تقدّم: extracting بعدين splitting", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    const stages: string[] = [];
    await chunkLectureFile(file, (p) => stages.push(p.stage));

    expect(stages).toContain("extracting");
    expect(stages).toContain("splitting");
    expect(stages.indexOf("extracting")).toBeLessThan(
      stages.lastIndexOf("splitting"),
    );
  });

  it("بيظفّف الملفات المؤقتة في finally", async () => {
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await chunkLectureFile(file);

    expect(h.deleted).toContain("input.media");
    expect(h.deleted).toContain("extracted.mp3");
  });

  it("بيظفّف حتى لو العملية فشلت", async () => {
    h.execExit = 1;
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await expect(chunkLectureFile(file)).rejects.toThrow();
    expect(h.deleted).toContain("input.media");
  });

  it("بيفشل بوضوح لو المدّة معروفةش", async () => {
    h.duration = null;
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    await expect(chunkLectureFile(file)).rejects.toThrow(
      /ffmpeg_unknown_duration/,
    );
  });

  it("MP3 برضو ممكن يروح لمسار FFmpeg بالضغط", async () => {
    const file = new File([new Uint8Array(mb(1))], "lecture.mp3", {
      type: "audio/mpeg",
    });
    await chunkLectureFile(file, undefined, true);
    expect(h.loadCalls).toBeGreaterThan(0);
  });
});

describe("ضمان الحجم — الجزء مش هيعدّي حد المنصّة", () => {
  it("الجزء الواحد مابيدخلش 3 ميجا", async () => {
    // كل جزء من FFmpeg بيطلع 5 ميجا > الحد → لازم يتقسم تاني.
    h.outputBytes = 5 * 1024 * 1024;
    h.outputSeconds = 300;
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    const chunks = await chunkLectureFile(file);

    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.file.size).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
    }
  });

  it("الاسم بيترقّم حسب ترتيب الأجزاء الفعلي", async () => {
    h.outputBytes = 5 * 1024 * 1024;
    const file = fileOf(mb(20), "lecture.webm", "video/webm");
    const chunks = await chunkLectureFile(file);

    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.name).toBe(`lecture.part${i + 1}.mp3`);
    });
  });
});
