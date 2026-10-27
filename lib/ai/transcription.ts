/* ==========================================================================
   ??? ����� ��������� � ���������� ������ ������ (Groq ? Deepgram ? AssemblyAI ? ElevenLabs)
   ??????????????????????????????????????????????????????????????????????? */

import {
  assertLectureFile,
  TranscriptionError,
  type LectureTranscript,
  type TranscriptWord,
} from "./transcription-shared";

export { TranscriptionError, MAX_LECTURE_FILE_BYTES } from "./transcription-shared";
export type {
  LectureTranscript,
  TranscriptSegment,
  TranscriptWord,
} from "./transcription-shared";

export const GROQ_STT_MODEL = "whisper-large-v3-turbo";
export const SCRIBE_MODEL_ID = "scribe_v2";

const STT_TIMEOUT_MS = 5 * 60 * 1000;
const SEGMENT_GAP_SECONDS = 1.6;
const MAX_SEGMENTS = 600;
const MAX_WORDS = 20_000;
const GROQ_MAX_BYTES = 25 * 1024 * 1024;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildSegments(words: TranscriptWord[]) {
  const segments: Array<{ text: string; start: number; end: number; speaker: string | null }> = [];
  let current: (typeof segments)[number] | null = null;
  let lastEnd = 0;
  for (const word of words) {
    const isNewSpeaker =
      current !== null && current.speaker !== null && word.speaker !== null && word.speaker !== current.speaker;
    const isLongPause = current !== null && word.start - lastEnd > SEGMENT_GAP_SECONDS;
    if (current === null || isNewSpeaker || isLongPause) {
      current = { text: "", start: word.start, end: word.end, speaker: word.speaker };
      segments.push(current);
    }
    const needsSpace = current.text !== "" && !/\s$/.test(current.text);
    current.text += `${needsSpace ? " " : ""}${word.text}`;
    current.end = Math.max(current.end, word.end);
    lastEnd = word.end;
    if (segments.length >= MAX_SEGMENTS) break;
  }
  return segments.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }));
}

function normalizeGeneric(params: {
  text: string | null;
  language: string | null;
  duration: number | null;
  words: TranscriptWord[];
  segments?: { text: string; start: number; end: number; speaker: string | null }[];
  model: string;
  provider: string;
}): LectureTranscript {
  const words = params.words.slice(0, MAX_WORDS);
  const segments =
    params.segments && params.segments.length > 0
      ? params.segments.slice(0, MAX_SEGMENTS)
      : buildSegments(words);
  const text =
    params.text ??
    (segments.length > 0 ? segments.map((s) => s.text).join(" ") : words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim());
  const lastEnd = words.length ? words[words.length - 1].end : segments.length ? segments[segments.length - 1].end : null;
  const duration = params.duration ?? (lastEnd !== null && lastEnd > 0 ? Math.round(lastEnd) : null);
  return { text, language: params.language, languageProbability: null, duration, segments, words, model: params.model, provider: params.provider };
}

/* ??????????????? Groq ??????????????? */
async function transcribeWithGroq(blob: Blob, fileName: string): Promise<LectureTranscript> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new TranscriptionError("SERVICE_NOT_CONFIGURED", "no key", 503);
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("model", GROQ_STT_MODEL);
  form.append("language", "ar");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  let res: Response;
  try { res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(STT_TIMEOUT_MS) }); }
  catch (e) { throw new TranscriptionError("NETWORK_ERROR", "groq network", 502); }
  const raw = await res.text();
  if (!res.ok) throw new TranscriptionError("PROVIDER_ERROR", raw.slice(0, 200), res.status === 429 ? 503 : 502);
  const p = JSON.parse(raw);
  const words: TranscriptWord[] = Array.isArray(p.words) ? p.words.map((w: any) => ({ text: str(w.word ?? w.text) ?? "", start: num(w.start) ?? 0, end: num(w.end) ?? 0, speaker: null })) : [];
  const segs = Array.isArray(p.segments) ? p.segments.map((s: any) => ({ text: (str(s.text) ?? "").trim(), start: num(s.start) ?? 0, end: num(s.end) ?? 0, speaker: null })).filter((s: any) => s.text) : [];
  return normalizeGeneric({ text: str(p.text), language: str(p.language), duration: num(p.duration), words, segments: segs, model: GROQ_STT_MODEL, provider: "groq" });
}

/* ??????????????? Deepgram ??????????????? */
async function transcribeWithDeepgram(blob: Blob, mimeType: string): Promise<LectureTranscript> {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) throw new TranscriptionError("SERVICE_NOT_CONFIGURED", "no key", 503);
  const url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=ar";
  let res: Response;
  try { res = await fetch(url, { method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": mimeType || "audio/*" }, body: blob, signal: AbortSignal.timeout(STT_TIMEOUT_MS) }); }
  catch (e) { throw new TranscriptionError("NETWORK_ERROR", "deepgram network", 502); }
  const raw = await res.text();
  if (!res.ok) throw new TranscriptionError("PROVIDER_ERROR", raw.slice(0, 200), 502);
  const p = JSON.parse(raw);
  const alt = p?.results?.channels?.[0]?.alternatives?.[0];
  const transcriptText = str(alt?.transcript);
  const words: TranscriptWord[] = Array.isArray(alt?.words) ? alt.words.map((w: any) => ({ text: str(w.punctuated_word ?? w.word) ?? "", start: num(w.start) ?? 0, end: num(w.end) ?? 0, speaker: null })) : [];
  const duration = num(p?.metadata?.duration);
  return normalizeGeneric({ text: transcriptText, language: "ar", duration, words, model: "nova-2", provider: "deepgram" });
}

/* ??????????????? AssemblyAI ??????????????? */
async function transcribeWithAssemblyAI(blob: Blob): Promise<LectureTranscript> {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!key) throw new TranscriptionError("SERVICE_NOT_CONFIGURED", "no key", 503);
  // 1. upload
  let uploadRes: Response;
  try { uploadRes = await fetch("https://api.assemblyai.com/v2/upload", { method: "POST", headers: { Authorization: key, "Content-Type": "application/octet-stream" }, body: blob, signal: AbortSignal.timeout(STT_TIMEOUT_MS) }); }
  catch (e) { throw new TranscriptionError("NETWORK_ERROR", "aai upload network", 502); }
  const uploadRaw = await uploadRes.text();
  if (!uploadRes.ok) throw new TranscriptionError("PROVIDER_ERROR", uploadRaw.slice(0, 200), 502);
  const uploadUrl = JSON.parse(uploadRaw)?.upload_url;
  if (!uploadUrl) throw new TranscriptionError("PROVIDER_BAD_RESPONSE", "no upload_url", 502);
  // 2. create transcript
  let createRes: Response;
  try { createRes = await fetch("https://api.assemblyai.com/v2/transcript", { method: "POST", headers: { Authorization: key, "Content-Type": "application/json" }, body: JSON.stringify({ audio_url: uploadUrl, language_code: "ar" }), signal: AbortSignal.timeout(STT_TIMEOUT_MS) }); }
  catch (e) { throw new TranscriptionError("NETWORK_ERROR", "aai create network", 502); }
  const createRaw = await createRes.text();
  if (!createRes.ok) throw new TranscriptionError("PROVIDER_ERROR", createRaw.slice(0, 200), 502);
  const transcriptId = JSON.parse(createRaw)?.id;
  if (!transcriptId) throw new TranscriptionError("PROVIDER_BAD_RESPONSE", "no id", 502);
  // 3. poll
  const deadline = Date.now() + STT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let pollRes: Response;
    try { pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(30_000) }); }
    catch (e) { throw new TranscriptionError("NETWORK_ERROR", "aai poll network", 502); }
    const pollRaw = await pollRes.text();
    if (!pollRes.ok) throw new TranscriptionError("PROVIDER_ERROR", pollRaw.slice(0, 200), 502);
    const data = JSON.parse(pollRaw);
    if (data.status === "completed") {
      const words: TranscriptWord[] = Array.isArray(data.words) ? data.words.map((w: any) => ({ text: str(w.text) ?? "", start: (num(w.start) ?? 0) / 1000, end: (num(w.end) ?? 0) / 1000, speaker: null })) : [];
      return normalizeGeneric({ text: str(data.text), language: str(data.language_code) ?? "ar", duration: num(data.audio_duration), words, model: "assemblyai", provider: "assemblyai" });
    }
    if (data.status === "error") {
      throw new TranscriptionError("PROVIDER_ERROR", String(data.error ?? "aai error"), 502);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new TranscriptionError("PROVIDER_TIMEOUT", "������� ��� ��� ���� ��� ���� ��� ����.", 502);
}

/* ??????????????? ElevenLabs ??????????????? */
async function transcribeWithElevenLabs(blob: Blob, fileName: string): Promise<LectureTranscript> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new TranscriptionError("SERVICE_NOT_CONFIGURED", "no key", 503);
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  form.append("timestamps_granularity", "word");
  form.append("file", blob, fileName);
  let res: Response;
  try { res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key, Accept: "application/json" }, body: form, signal: AbortSignal.timeout(STT_TIMEOUT_MS) }); }
  catch (e) { throw new TranscriptionError("NETWORK_ERROR", "elevenlabs network", 502); }
  const raw = await res.text();
  if (!res.ok) throw new TranscriptionError("PROVIDER_ERROR", raw.slice(0, 200), 502);
  const p = JSON.parse(raw);
  const words: TranscriptWord[] = Array.isArray(p.words) ? p.words.map((w: any) => ({ text: str(w.text) ?? "", start: num(w.start) ?? 0, end: num(w.end) ?? 0, speaker: str(w.speaker_id) ?? str(w.speaker) })) : [];
  const segs = Array.isArray(p.segments) ? p.segments.map((s: any) => ({ text: (str(s.text) ?? "").trim(), start: num(s.start) ?? 0, end: num(s.end) ?? 0, speaker: str(s.speaker) ?? null })).filter((s: any) => s.text) : [];
  return normalizeGeneric({ text: str(p.text), language: str(p.language_code), duration: null, words, segments: segs.length ? segs : undefined, model: "scribe_v2", provider: "elevenlabs" });
}

/* ??????????????? Orchestration ??????????????? */
async function transcribeBlob(blob: Blob, fileName: string, mimeType: string): Promise<LectureTranscript> {
  const providers: Array<{ name: string; run: () => Promise<LectureTranscript> }> = [];
  if (blob.size <= GROQ_MAX_BYTES && process.env.GROQ_API_KEY) {
    providers.push({ name: "groq", run: () => transcribeWithGroq(blob, fileName) });
  }
  if (process.env.DEEPGRAM_API_KEY) {
    providers.push({ name: "deepgram", run: () => transcribeWithDeepgram(blob, mimeType) });
  }
  if (process.env.ASSEMBLYAI_API_KEY) {
    providers.push({ name: "assemblyai", run: () => transcribeWithAssemblyAI(blob) });
  }
  if (process.env.ELEVENLABS_API_KEY) {
    providers.push({ name: "elevenlabs", run: () => transcribeWithElevenLabs(blob, fileName) });
  }
  if (providers.length === 0) {
    throw new TranscriptionError("SERVICE_NOT_CONFIGURED", "���� ����� ��������� ��� ����� ������. ���� ��� ���� ������.", 503);
  }
  let lastError: unknown = null;
  for (const p of providers) {
    try {
      console.log(`Trying ${p.name}...`);
      const result = await p.run();
      return result;
    } catch (error) {
      console.warn(`${p.name} failed, falling back`, error);
      lastError = error;
    }
  }
  if (lastError instanceof TranscriptionError) throw lastError;
  throw new TranscriptionError("PROVIDER_ERROR", "���� ����� ����� ����� ��������. ���� ��� ����.", 502);
}

export async function transcribeLecture(file: File): Promise<LectureTranscript> {
  assertLectureFile(file);
  return transcribeBlob(file, file.name, file.type);
}

export async function transcribeLectureFromUrl(signedUrl: string): Promise<LectureTranscript> {
  if (typeof signedUrl !== "string" || !signedUrl.startsWith("https://")) {
    throw new TranscriptionError("INVALID_URL", "���� ����� ������� ��� ����. ���� ���� �������� �� ����.", 400);
  }
  let blob: Blob;
  try {
    const res = await fetch(signedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    blob = await res.blob();
  } catch (error) {
    console.error("lecture-transcription: ��� ����� ����� �� �������", error);
    throw new TranscriptionError("NETWORK_ERROR", "���� ����� �� ������� ����� �������. ����� �� ���� ����� ����.", 502);
  }
  const name = signedUrl.split("/").pop()?.split("?")[0] || "lecture.mp3";
  return transcribeBlob(blob, name, blob.type || "audio/mpeg");
}


