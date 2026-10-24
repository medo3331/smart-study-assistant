/**
 * ط§ط®طھط¨ط§ط± ط§ظ„ط¶ط؛ط· ظ‚ط¨ظ„ ط§ظ„ط±ظپط¹ â€” Phase ط§ظ„ظ…ط­ط§ط¶ط±ط©
 * â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
 *
 * â›” ظ…ط§ط´ط§ط³ط© FFmpeg ط¨ط§ظƒظƒ: ط§ظ„ظ…ط­ط±ظ‘ظƒ ط§ظ„ط­ظ‚ظٹظ‚ظٹ ظ…ط§طھط­ظ…ظ‘ط´â€‹ط§ط·ظ‹ط§ظ‹.
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

/** ظ…ط­ط§ظƒط§ط© navigator.deviceMemory */
function mockDeviceMemory(memory: number | undefined) {
  Object.defineProperty(navigator, "deviceMemory", {
    configurable: true,
    get: () => memory,
  });
}

/** ظ…ط­ط§ظƒط§ط© navigator.userAgent */
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

describe("ط§ظ„ظ‚ط±ط§ط±ط© â€” ط§ظ„ط­ط¯ ظˆط§ظ„ط¹ط¯ط§ط¯ط©", () => {
  it("âœ… 45 MB طھظƒط³ط±ظٹط§ظ† ط£ط³ط·ط± ظ…ظ† ط§ظ„ظ…ط¹ط§ط¬ط©", () => {
    expect(needsCompression({ type: "video/mp4", size: mb(45) })).toBe(false);
    expect(needsCompression({ type: "video/mp4", size: mb(44) })).toBe(false);
    expect(needsCompression({ type: "video/mp4", size: 0 })).toBe(false);
  });

  it("âœ… ط£ظƒط¨ط± ظ…ظ† 45 MB ظٹط­طھط§ط¬ ط¶ط؛ط·", () => {
    expect(needsCompression({ type: "video/mp4", size: mb(45) + 1 })).toBe(true);
    expect(needsCompression({ type: "video/mp4", size: mb(51) })).toBe(true);
  });

  it("âœ… ط§ظ„ظ…ط¹ط§ط¯ط§طھ: 64â†’48â†’32â†’24 ط­ط³ط¨ ط§ظ„ظ…ط¯ط©", () => {
    expect(bitrateForDuration(30 * 60)).toBe(64);
    expect(bitrateForDuration(60 * 60)).toBe(64);
    expect(bitrateForDuration(61 * 60)).toBe(48);
    expect(bitrateForDuration(120 * 60)).toBe(48);
    expect(bitrateForDuration(121 * 60)).toBe(32);
    expect(bitrateForDuration(180 * 60)).toBe(32);
    expect(bitrateForDuration(181 * 60)).toBe(32);
    expect(bitrateForDuration(99999 * 60)).toBe(32); // above 2h -> floor rung
  });

  it("âœ… ط§ط³ظ… ط§ظ„ظ…ظ„ظپ ظٹظڈظ…ظ‘ظ„ ظˆط§ط­ط¯", () => {
    expect(mp3Filename("lecture.mp4")).toBe("lecture.mp3");
    expect(mp3Filename("my talk.webm")).toBe("my talk.mp3");
    expect(mp3Filename("noext")).toBe("noext.mp3");
  });

  it("âœ… ط³ظ„ظ‘ظ… ظ…ط¹ط§ط¯ط§طھ ظ…طھظ†ط§ط²ظ„", () => {
    expect([...BITRATE_LADDER_KBPS]).toEqual([64, 48, 32]);
  });
});

describe("ط§ظ„ط¶ط؛ط· â€” ط§ظ„ظ…ط­ط±ظ‘ظƒ", () => {
  it("âœ… ظ…ظ„ظپ طµط؛ظٹط± â†’ ظ…ط§ظپظٹط´ طھظ…ط³ظƒ FFmpeg ظˆظ„ط§ ط¶ط؛ط·", async () => {
    const small = fileOf(mb(10), "small.mp3", "audio/mpeg");
    const result = await compressLectureMedia(small, undefined, durationOf(10));

    expect(result.file).toBe(small);
    expect(result.finalBytes).toBe(mb(10));
    expect(h.loadCalls).toBe(0);
    expect(h.execCalls).toHaveLength(0);
  });

  it("âœ… ظ…ظ„ظپ ط£ظƒط¨ط± â†’ ط¨ظٹط·ظ„ظ…طµ طµظˆطھ MP3 mono ظ…ظ† ط؛ظٹط± ظپظٹط¯ظٹظˆ", async () => {
    await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));

    const args = h.execCalls[0];
    expect(args).toContain("-vn");
    expect(args[args.indexOf("-ac") + 1]).toBe("1");      // mono
    expect(args).toContain("-b:a");
    expect(args[args.indexOf("-b:a") + 1]).toBe("64k");   // 30min -> 64k
    expect(h.loadCalls).toBe(1);
  });

  it("âœ… ظ†طھط§ط¬ ط¯ط§ط®ظ„ ط§ظ„ط­ط¯ â†’ ظٹط³طھط£ظ† ظ„ظ„ط±ظپط¹", async () => {
    h.outputBytes = mb(18);
    const result = await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));

    expect(result.file.type).toBe(MP3_MIME);
    expect(result.file.name).toBe("lecture.mp3");
    expect(result.finalBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(result.retries).toBe(0);
    expect(result.originalBytes).toBe(mb(51));
  });

  it("âœ… ظ†طھط§ط¬ ط£ظƒط¨ط± â†’ ط¬ط±ظ‘ط¨ ط¨ظ…ط¹ط¯ط¯ ط£ط®ظپطµ ط­طھظ‰ ظٹط¯ط®ظ„", async () => {
    // âڑ ï¸ڈ 50 > 45 ظˆ 46 > 45 ظˆ 30 <= 45 â†’ ط«ظ„ط§ط« ط¬ط±ط¨طھ ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط¹ط§ط¯ط©.
    h.outputLadder = [mb(50), mb(46), mb(30)];
    const result = await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));

    expect(result.bitrateKbps).toBe(32);
    expect(result.retries).toBe(2);
    expect(result.finalBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(h.execCalls).toHaveLength(3);
  });

  mockDeviceMemory(16); // 120MB device limit
  it("â‌Œ ظ„ظ… ظٹط¯ط®ظ„ ط¨ط¹ط¯ ط£ظ‚ظ„ ظ…ط¹ط§ط¯ط© â†’ ط±ظپط¹ ط¨ط±ط³ط§ظ„ط©", async () => {
    h.outputBytes = mb(300);
    await expect(
      compressLectureMedia(fileOf(mb(50)), undefined, durationOf(30 * 60)),
    ).rejects.toThrow("still_too_large");
  });

  it("â‌Œ ظپط´ظ„ طھط­ظ…ظٹظ„ FFmpeg ط¨ظٹط±طھظ‡ظٹ ظ„ظ„ط·ط§ظ„ط¨", async () => {
    h.loadThrows = true;
    await expect(
      compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60)),
    ).rejects.toThrow();
  });

  mockDeviceMemory(16); // 120MB device limit
  it("â‌Œ ظ„ظ… ظ†ط±ظپط¹ ط§ظ„ظ…ظ„ظپ ط§ظ„ط£طµظ„ظٹ ط£ط¨ط¯ظ‹ط§ظ‹", async () => {
    h.outputBytes = mb(300);
    await expect(
      compressLectureMedia(fileOf(mb(50)), undefined, durationOf(30 * 60)),
    ).rejects.toThrow();
    // âڑ ï¸ڈ the original is never "returned for upload" on failure.
    expect(h.execCalls.length).toBeGreaterThan(0);
  });

  it("âœ… ط§ظ„ظ†ط¸ط§ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ظ…ظ† ط§ظ„ظ†ط¸ط§ظ…", async () => {
    await compressLectureMedia(fileOf(mb(51)), undefined, durationOf(30 * 60));
    expect(h.deleted).toContain("input.media");
    expect(h.deleted).toContain("output.mp3");
  });

  it("âœ… ط¨ظٹظ†ط´ط± ظ†ط³ط¨ط© طھظ‚ط¯ظ…", async () => {
    const seen: number[] = [];
    await compressLectureMedia(fileOf(mb(51)), (p) => seen.push(p.ratio), durationOf(30 * 60));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("getDeviceLimit â€” ط­ط¯ظˆط¯ ط§ظ„ط¬ظ‡ط§ط²", () => {
  afterEach(() => {
    delete (navigator as any).deviceMemory;
    delete (navigator as any).userAgent;
  });

  it("RAM â‰¤ 2GB â†’ 40MB", () => {
    mockDeviceMemory(2);
    expect(getDeviceLimit()).toBe(40 * 1024 * 1024);
  });

  it("RAM â‰¤ 4GB â†’ 60MB", () => {
    mockDeviceMemory(4);
    expect(getDeviceLimit()).toBe(60 * 1024 * 1024);
  });

  it("RAM â‰¤ 8GB â†’ 100MB", () => {
    mockDeviceMemory(8);
    expect(getDeviceLimit()).toBe(100 * 1024 * 1024);
  });

  it("RAM > 8GB â†’ 120MB", () => {
    mockDeviceMemory(16);
    expect(getDeviceLimit()).toBe(120 * 1024 * 1024);
  });

  it("no deviceMemory + iOS UA â†’ 60MB", () => {
    delete (navigator as any).deviceMemory;
    mockUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)");
    expect(getDeviceLimit()).toBe(60 * 1024 * 1024);
  });

  it("no deviceMemory + Android UA â†’ 80MB", () => {
    delete (navigator as any).deviceMemory;
    mockUserAgent("Mozilla/5.0 (Linux; Android 10; SM-G973F)");
    expect(getDeviceLimit()).toBe(80 * 1024 * 1024);
  });

  it("no deviceMemory + desktop UA â†’ 120MB", () => {
    delete (navigator as any).deviceMemory;
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(getDeviceLimit()).toBe(120 * 1024 * 1024);
  });
});

describe("needsCompression ظ…ط¹ ط­ط¯ظˆط¯ ط§ظ„ط¬ظ‡ط§ط²", () => {
  afterEach(() => {
    delete (navigator as any).deviceMemory;
    delete (navigator as any).userAgent;
  });

  it("ظ…ظ„ظپ ط£ظƒط¨ط± ظ…ظ† ط­ط¯ ط§ظ„ط¬ظ‡ط§ط² ظ„ط§ ظٹط­طھط§ط¬ ط¶ط؛ط· (ط³ظٹط¸ظ‡ط± ط®ط·ط£ ظپظٹ ط§ظ„ظˆط§ط¬ظ‡ط©)", () => {
    mockDeviceMemory(2); // 40MB limit
    const largeFile = { size: 50 * 1024 * 1024, type: "audio/wav" } as File;
    expect(needsCompression(largeFile)).toBe(false);
  });

  it("ظ…ظ„ظپ ط£طµط؛ط± ظ…ظ† ط­ط¯ ط§ظ„ط¬ظ‡ط§ط² ظٹط­طھط§ط¬ ط¶ط؛ط· ط¥ط°ط§ ط£ظƒط¨ط± ظ…ظ† 45MB", () => {
    mockDeviceMemory(16); // 120MB limit
    const file = { size: 50 * 1024 * 1024, type: "audio/wav" } as File;
    expect(needsCompression(file)).toBe(true);
  });

  it("MP3 ظƒط¨ظٹط± ظ…ظ† ط­ط¯ ط§ظ„ط¬ظ‡ط§ط² ظ„ط§ ظٹط­طھط§ط¬ ط¶ط؛ط· (ظ…ط³طھط«ظ†ظ‰)", () => {
    mockDeviceMemory(2); // 40MB limit
    const largeMP3 = { size: 50 * 1024 * 1024, type: "audio/mpeg" } as File;
    expect(needsCompression(largeMP3)).toBe(false);
  });
});

