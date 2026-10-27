"use client";

/* ==========================================================================
   ًںژ™ï¸ڈ LectureTranscriber â€” ظˆط§ط¬ظ‡ط© طھظپط±ظٹط؛ ط§ظ„ظ…ط­ط§ط¶ط±ط§طھ
   â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ

   ط§ظ„ط´ط§ط´ط© ظƒظ„ظ‡ط§: ط§ط®طھظٹط§ط± ظ…ظ„ظپ â†گ طھط­ظˆظٹظ„ â†گ ط¹ط±ط¶ ط§ظ„ظ†طµ.

   âڑ ï¸ڈ ظ„ظٹظ‡ ط§ظ„ظ†طµظˆطµ ظ‡ظ†ط§ ط¹ط±ط¨ظٹ hardcoded ظˆظ…ط´ ظپظٹ `lib/i18n/dictionaries`:
   ط§ظ„طµظپط­ط© ط¯ظٹ ط¹ط±ط¨ظٹط© ط¨ط§ظ„ظƒط§ظ…ظ„ ط­ط³ط¨ ط·ظ„ط¨ ط§ظ„ظ…ظ†طھط¬ (ط§ظ„ط¬ظ…ظ‡ظˆط± ط·ظ„ط§ط¨ ط¹ط±ط¨)طŒ ظˆط¯ظ‡ ظ†ظپط³
   ط§ظ„ظ„ظٹ ط¨ظٹطھط¹ظ…ظ„ ظپظٹ `app/ai-studio` ظˆ`components/ai/*`. ظ„ظˆ ط­ط¨ظٹطھ ط§ظ„طھط±ط¬ظ…ط©
   ظ„ط§ط­ظ‚ظ‹ط§طŒ ط§ظ„ظƒظˆط¯ ظƒظ„ظ‡ ظپظٹ ظƒظˆظ…ط¨ظˆظ†ظ†طھ ظˆط§ط­ط¯ ظˆط§ظ„ظ†طµظˆطµ ظپظٹظ‡ ط³ظ‡ظ„ط© ط§ظ„ط¥ط®ط±ط§ط¬ ظ„ظ„ظ‚ط§ظ…ظˆط³.

   âڑ ï¸ڈ ط§ظ„ط¹ظ‚ط¯ ظ…ط¹ ط§ظ„ط³ظٹط±ظپط± (3 ظ†ظ‚ط§ط·):
     - POST /api/lecture-transcription/upload-url ط¨ظ€ JSON { filename,
       contentType, size } â†گ ط¨ظٹط±ط¬ظ‘ط¹ { signedUrl, token, path, expiresIn,
       ticketId, secret }. طھط°ظƒط±ط© ظ…ط¤ظ‚طھط© ط¹ظ„ظ‰ **ظ…ط³ط§ط± ظˆط§ط­ط¯**ط› ظ…ظپظٹط´ ط£ظٹ طµظ„ط§ط­ظٹط©
       ط¹ط§ظ…ط© ط¹ظ„ظ‰ ط§ظ„ط¨ط§ظƒظٹطھ.
     - PUT ط§ظ„ظ…طھطµظپط­ ط¹ظ„ظ‰ signedUrl ظ…ط¨ط§ط´ط±ط© (ظ…ط´ ظپظٹ ط§ظ„ظپط§ظ†ظƒط´ظ†) â€” ظˆط¯ظ‡ ط§ظ„ظ„ظٹ
       ط¨ظٹط´ظٹظ„ ط­ط¯ ط§ظ„ظ€ 4.5 ظ…ظٹط¬ط§.
     - POST /api/lecture-transcription/transcribe ط¨ظ€ JSON { path, filename,
       size, ticketId, secret? } â†گ ط¨ظٹط±ط¬ظ‘ط¹ `{ transcript: LectureTranscript }`
       (ظ†ظپط³ ط§ظ„ظ…ط±ط­ظ„ط© 1).
     ظƒظ„ظ‡ظ… ط¨ظٹط±ط¬ط¹ظˆط§ `{ error: { code, message } }` ط¹ظ†ط¯ ط§ظ„ظپط´ظ„.
     **ظƒظ„** ط§ظ„ظƒظ„ط§ظ… ط¹ظ† ElevenLabs ظˆط§ظ„ط£ط³ط¹ط§ط± ظ…ط¹ط²ظˆظ„ ط¬ظˆظ‡
     `lib/ai/transcription.ts` â€” ط§ظ„ظƒظ„ط§ظٹظ†طھ ظ…ط´ ط´ط§ظٹظپ ظˆظ„ط§ ط³ط·ط± ظ…ظ†ظ‡.

   ًںژ« طھط°ط§ظƒط± ط§ظ„ظ…ظ„ظƒظٹط©: `ticketId` (+ `secret` ظ„ظ„ط²ط§ط¦ط± ط¨ظ„ط§ ط¬ظ„ط³ط©) ط¨ظٹطھطµط±ظپظˆط§
   ظ…ظ† /upload-url ظˆط¨ظٹطھط¨ط¹طھظˆط§ ظ…ط¹ ظƒظ„ ظ†ط¯ط§ط، ظ„ظ€ /transcribe. ط§ظ„طھط°ظƒط±ط© ط¨طھط³طھظ‡ظ„ظƒ
   ظ…ط¹ ط£ظˆظ„ ظ†ط¬ط§ط­ طھظپط±ظٹط؛ (ط­طھظ‰ ظ„ظˆ ط§ظ„ط­ظپط¸ ظپط´ظ„) â€” ظپط£ظٹ 404 ظ…ظ† /transcribe ظ…ط¹ظ†ط§ظ‡ط§
   آ«ط§ط±ظپط¹ ظ…ظ† ط¬ط¯ظٹط¯آ»طŒ ظˆط§ظ„ط¹ظ…ظٹظ„ ط¨ظٹظ…ط³ط­ ط§ظ„ظ…ط³ط§ط± ظˆط§ظ„طھط°ظƒط±ط© ظپظˆط±ظ‹ط§.

   âڑ ï¸ڈ ط§ظ„ط§ط³طھظٹط±ط§ط¯: `lib/ai/transcription-shared` ط¨ط³ (ظ…ظپظٹظ‡ظˆط´ `process.env`
   ظˆظ„ط§ `fetch`). ط§ط³طھظٹط±ط§ط¯ `lib/ai/transcription` ظ‡ظ†ط§ ظƒط§ظ† ظ‡ظٹط¹ظ†ظٹ ظƒظˆط¯ ط§ظ„ظ…ط²ظˆظ‘ط¯
   ظپظٹ ط§ظ„ظ€ client bundle.

   â•گâ•گâ•گ ط§ظ„طھطµظ…ظٹظ… â•گâ•گâ•گ
   طھظˆظƒظ†ط§طھ ط§ظ„ط«ظٹظ… ظ…ظ† `app/globals.css` (--app-bg / --card-primary / --rule /
   --accent / --text / --muted) ط²ظٹ `app/ai-studio` ط¨ط§ظ„ط¸ط¨ط· â€” ظپط¨ظٹط´طھط؛ظ„ ط¹ظ„ظ‰
   ط§ظ„ط«ظٹظ…ط§طھ ط§ظ„ط£ط±ط¨ط¹ط© ظ…ظ† ط؛ظٹط± ط£ظٹ CSS ط¬ط¯ظٹط¯. طµظپط± ظƒظ„ط§ط³ط§طھ ظپظٹ globals.css.

   â•گâ•گâ•گ RTL ظˆط§ظ„ط®ط·ظˆط· ط§ظ„ظ…ط®طھظ„ط·ط© â•گâ•گâ•گ
   ظ…ط±ط¨ط¹ ط§ظ„ظ†طµ `dir="rtl"` + `unicode-bidi: plaintext`: ط§ظ„ط¹ط±ط¨ظٹ ط¨ظٹطھط¸ط¨ط· RTL
   طھظ„ظ‚ط§ط¦ظٹط§ظ‹طŒ ظˆط§ظ„ظƒظ„ظ…ط© ط§ظ„ط¥ظ†ط¬ظ„ظٹط²ظٹط© ط¬ظˆط§ظ‡ (آ«JavaScriptآ»طŒ آ«APIآ») ط¨طھطھظ‚ط±ظٹ LTR
   ظ…ظ† ط؛ظٹط± ط¥ظ† ط¹ظ„ط§ظ…ط§طھ ط§ظ„طھط±ظ‚ظٹظ… طھظ†ط·ظ‘. ظ…ط¹ `white-space: pre-wrap` ط¹ط´ط§ظ† ط§ظ„ظپظ‚ط±ط§طھ
   ط§ظ„ط·ظˆظٹظ„ط© ظˆط§ظ„ط£ط³ط·ط± ط§ظ„ط¬ط¯ظٹط¯ط© ظپظٹ ط±ط¯ ط§ظ„ظ…ط²ظˆظ‘ط¯ ظ…ط§طھظ†ط·ظ…ط³ط´طŒ ظˆ`overflow-wrap:
   anywhere` ط¹ط´ط§ظ† ظƒظ„ظ…ط© ط·ظˆظٹظ„ط© ظ…ط§ طھظƒط³ظ‘ط±ط´ ط§ظ„طھط®ط·ظٹط·.
   â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */

import { useCallback, useRef, useState } from "react";
import {
  compressLectureMedia,
  needsCompression,
  getDeviceLimit,
} from "@/lib/media/lecture-compression";
import {
  needsRecoveryCard,
  recoveryBlurb,
  recoveryOptions,
  recoveryTitle,
  stageFromCode,
  type RecoveryAction,
  type RecoveryOption,
  type FailureStage,
} from "@/lib/media/lecture-recovery";
import Link from "next/link";

/** ط®طµط§ط¦طµ ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ â€” ظƒظ„ظ‡ط§ ظ‚ظٹظ… ظ„ظ„ط¹ط±ط¶ ظپظ‚ط·طŒ ط¨ظ„ط§ ط£ظٹ ط¨ظٹط§ظ†ط§طھ ظ…ط³طھط®ط¯ظ…. */
type RecoveryCardProps = {
  stage: FailureStage;
  attempts: number;
  message: string;
  working: boolean;
  onAction: (action: RecoveryAction) => void;
};

/**
 * ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ ط¨ط¹ط¯ ط§ظ„ظپط´ظ„ â€” ظ†ظپط³ ط«ظٹظ… Magicly (طھظˆظƒظ†ط§طھ CSS ظپظ‚ط·طŒ ط¨ظ„ط§ CSS ط¬ط¯ظٹط¯).
 *
 * âڑ ï¸ڈ طھظڈط±ط³ظژظ… ظپظ‚ط· ط¹ظ†ط¯ظ…ط§: ظپظٹ ط±ط³ط§ظ„ط© ط®ط·ط£ + ظƒظˆط¯ ظپط´ظ„ ظ…ط¹ط±ظˆظپ + ط§ظ„ظ…ط±ط­ظ„ط© طھط³طھط­ظ‚
 * ط¨ط·ط§ظ‚ط© (طھط¬ظ‡ظٹط²/ط±ظپط¹ â€” ظ…ط´ طھظپط±ظٹط؛طŒ ظ„ط£ظ† ط§ظ„طھظپط±ظٹط؛ ظ„ظ‡ ط²ط±ظ‘ظ‡ آ«ط­ط§ظˆظ„ طھط­ظˆظٹظ„ظ‡ط§ طھط§ظ†ظٹآ»).
 * ظƒظ„ ط²ط± ظپظٹظ‡ط§ ط¨ظٹظ†ظپظ‘ط° ط¥ط¬ط±ط§ط،ظ‹ ط­ظ‚ظٹظ‚ظٹظ‹ط§: ط¥ط¹ط§ط¯ط© ظٹط¯ظˆظٹط© (ظ…ط­ط§ظˆظ„ط© ظˆط§ط­ط¯ط©) /
 * ظپطھط­ ظ…ظ†طھظ‚ظٹ ط§ظ„ظ…ظ„ظپط§طھ / طھط¹ظ„ظٹظ…ط§طھ ط§ظ„طھظ‚ط³ظٹظ… ط¸ط§ظ‡ط±ط© ظƒظ†طµ / ط±ط§ط¨ط· `/ai-studio`.
 * ظ„ط§ طھظڈط¹ط±ط¶ ط£ظٹ ط£ط³ظ…ط§ط، ظ…ظ„ظپط§طھ ط£ظˆ ط£ط­ط¬ط§ظ… ط£ظˆ ط±ظˆط§ط¨ط· ط£ظˆ ط£ط³ط±ط§ط± â€” ط§ظ„ط¹ظ†ط§ظˆظٹظ†
 * ظˆط§ظ„طھظپط§طµظٹظ„ ظ†طµظˆطµ ط¹ط±ط¨ظٹط© ط«ط§ط¨طھط© ظ…ظ† `lecture-recovery`.
 */
function RecoveryCard({ stage, attempts, message, working, onAction }: RecoveryCardProps) {
  const title = recoveryTitle(stage);
  const blurb = recoveryBlurb(stage);
  const options = recoveryOptions(stage, attempts);
  const primaryClass =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryClass =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div role="alert" className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-4">
      <p className="text-base font-bold text-[var(--text)]">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{blurb}</p>
      <p className="mt-2 text-xs text-[var(--muted)]">{message}</p>
      <div className="mt-3 flex flex-col gap-2">
        {options.map((option: RecoveryOption) =>
          option.action === "paste-text" ? (
            <Link key={option.action} href="/ai-studio" className={secondaryClass}>
              <span>{option.label}</span>
            </Link>
          ) : (
            <button
              key={option.action}
              type="button"
              onClick={() => onAction(option.action)}
              disabled={working}
              className={option.primary ? primaryClass : secondaryClass}
            >
              <span>{option.label}</span>
            </button>
          ),
        )}
      </div>
      {/* طھظپط§طµظٹظ„ ظƒظ„ ط®ظٹط§ط± â€” ط§ظ„طھط¹ظ„ظٹظ…ط§طھ ط§ظ„ظƒط§ظ…ظ„ط© ظ„ظ„طھظ‚ط³ظٹظ… ط¸ط§ظ‡ط±ط© ظ‡ظ†ط§
          ظƒظ†طµ ط¨ظ„ط§ ط²ط± ظˆظ‡ظ…ظٹطŒ ط­ط³ط¨ ط§ظ„ظ‚ط§ط¹ط¯ط© ط§ظ„ظ…طھظپظ‚ ط¹ظ„ظٹظ‡ط§. */}
      <ul className="mt-3 space-y-1.5">
        {options.map((option: RecoveryOption) => (
          <li key={`detail-${option.action}`} className="text-xs leading-relaxed text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">{option.label}: </span>
            {option.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileAudio,
  LoaderCircle,
  Mic,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import {
  assertLectureFile,
  formatFileSize,
  LECTURE_FILE_ACCEPT,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_LECTURE_FILE_BYTES,
  TranscriptionError,
  type LectureTranscript,
  type UploadTicket,
} from "@/lib/ai/transcription-shared";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ظ†طµظˆطµ ط§ظ„ظˆط§ط¬ظ‡ط© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/** ط±ط³ط§ظ„ط© ط¹ط§ظ…ط© ظ„ظˆ ط§ظ„ط±ط§ظˆطھ ط±ط¬ظ‘ط¹ 5xx ظ…ظ† ط؛ظٹط± ط±ط³ط§ظ„ط© (ط¨ط±ظˆظƒط³ظٹ/ط¨ظ„ط§ ظ†طھ). */
const ERR_GENERIC = "ط­طµظ„طھ ظ…ط´ظƒظ„ط© ط£ط«ظ†ط§ط، طھط­ظˆظٹظ„ ط§ظ„ظ…ط­ط§ط¶ط±ط©. ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰.";
const ERR_NETWORK = "ظپظٹظ‡ط§ ظ…ط´ظƒظ„ط© ظپظٹ ط§ظ„ط§طھطµط§ظ„. ط§طھط£ظƒط¯ ظ…ظ† ط§ظ„ط¥ظ†طھط±ظ†طھ ظˆط­ط§ظˆظ„ طھط§ظ†ظٹ.";
const ERR_NO_FILE = "ط§ط®طھط± ظ…ظ„ظپ ط§ظ„ظ…ط­ط§ط¶ط±ط© ط§ظ„ط£ظˆظ„.";
const ERR_UPLOAD = "ظپط´ظ„ ط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط©. ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰.";
const ERR_UPLOAD_RETRY = "ظ…ظ‚ط¯ط±ظ†ط§ط´ ظ†ط¬ظ‡ظ‘ط² ط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط©. ط­ط§ظˆظ„ طھط§ظ†ظٹ ط¨ط¹ط¯ ط´ظˆظٹط©.";
/** ًںژ« ط§ظ„طھط°ظƒط±ط© ط§ط³طھظڈظ‡ظ„ظƒطھ/ط§ظ†طھظ‡طھ â€” ط§ظ„ط®ط§ط¯ظ… ط±ط¬ظ‘ط¹ ط§ظ„ط±ط¯ ط§ظ„ظ…ظˆط­ط¯ آ«ط§ط±ظپط¹ ظ…ظ† ط¬ط¯ظٹط¯آ». */
const ERR_TICKET_INVALID = "ط§ظ„طھط°ظƒط±ط© ط§ظ†طھظ‡طھ. ط§ط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط© ظ…ظ† ط¬ط¯ظٹط¯.";

/**
 * ظƒظˆط¯ ظپط´ظ„ ط«ط§ط¨طھ ظ„ظ„طھط´ط®ظٹطµ ط§ظ„ط¢ظ…ظ† â€” ط¨ظٹظڈط³ط¬ظژظ‘ظ„ ظپظٹ ط§ظ„ظƒظˆظ†ط³ظˆظ„ ظˆط¨ظٹظڈظ„طµظ‚ ظ†ط³ط®ط© طµط؛ظٹط±ط©
 * ظ…ظ†ظ‡ ظ…ط¹ ط±ط³ط§ظ„ط© ط§ظ„ظپط´ظ„ ظپظٹ ط§ظ„ظˆط§ط¬ظ‡ط©طŒ ط¹ط´ط§ظ† ظ†ط¹ط±ظپ **ط£ظٹ ظپط±ط¹ ط¨ط§ظ„طھط­ط¯ظٹط¯** ظˆظ‚ظپ
 * ظ…ظ† ط؛ظٹط± ظ…ط§ ظ†ط­طھط§ط¬ ظ…ظ† ط§ظ„ظ…ط³طھط®ط¯ظ… ظٹط¹ظٹط¯ ط¥ظ†طھط§ط¬ ط§ظ„ظ…ط´ظƒظ„ط© ظˆظ†ط­ظ† ط¹ظ…ط§ظ„ظٹظ† ظ†ط®ظ…ظ‘ظ†.
 *
 * âڑ ï¸ڈ **ظ…ظ…ظ†ظˆط¹ ط£ظٹ ط¨ظٹط§ظ†ط§طھ ظ…ط³طھط®ط¯ظ… ط¯ط§ط®ظ„ ط§ظ„ظƒظˆط¯**: ظ„ط§ ط§ط³ظ… ط§ظ„ظ…ظ„ظپطŒ ظ„ط§ ط§ظ„ط­ط¬ظ…,
 * ظ„ط§ ط§ظ„ط±ط§ط¨ط·طŒ ظ„ط§ ط§ظ„طھظˆظƒظ†طŒ ظˆظ„ط§ ظ…ط­طھظˆظ‰ ط±ط¯ ط§ظ„ط®ط§ط¯ظ… â€” ظƒظˆط¯ ظ‚طµظٹط± ط«ط§ط¨طھ ط¨ط³.
 * ظ…ط«ط§ظ„: `upload.xhr` = ظپط´ظ„ ط§ظ„ظ€ PUT ظ…ط¨ط§ط´ط±ط©طŒ `prep.duration` = ظپط´ظ„
 * ظ‚ط±ط§ط،ط© ظ…ط¯ط© ط§ظ„ظ…ظ„ظپ ظ‚ط¨ظ„ ط§ظ„ط¶ط؛ط·.
 */
function failCode(code: string, message: string): string {
  console.warn(`[lecture-transcription] failure code=${code}`);
  return `${message} (ظƒظˆط¯ ط§ظ„ط®ط·ط£: ${code})`;
}

/** ط§ظ„ط­ط¯ظ‘ ط¨ط§ظ„ط£ط±ظ‚ط§ظ… ط§ظ„ط¹ط±ط¨ظٹط©-ط§ظ„ظ‡ظ†ط¯ظٹط© ط²ظٹ ط¨ط§ظ‚ظٹ ط§ظ„ظˆط§ط¬ظ‡ط©. */
const MAX_SIZE_LABEL = formatFileSize(MAX_LECTURE_FILE_BYTES);

/** ط§ظ„طµظٹط؛ ط§ظ„ظ…ط¯ط¹ظˆظ…ط© ظپظٹ ط³ط·ط± ظˆط§ط­ط¯ طھط­طھ ظ…ظ†ط·ظ‚ط© ط§ظ„ط±ظپط¹. */
const FORMATS_LABEL = "MP3 آ· WAV آ· M4A آ· MP4 آ· AAC آ· FLAC آ· OGG آ· WEBM";

type Phase = "idle" | "working" | "done" | "error";

/** ظ…ط±ط­ظ„ط© ط§ظ„ط´ط؛ظ„ ط§ظ„ط¬ط§ط±ظٹط© â€” ط¨طھطھط­ظˆظ„ ظ„ط±ط³ط§ظ„ط© ظ…ط®طھظ„ظپط© ظ„ظƒظ„ ط®ط·ظˆط©.
 *  âڑ ï¸ڈ ظ…ظپظٹط´ ظ†ط³ط¨ط© ظ…ط¦ظˆظٹط© ط¹ظ† ظ‚طµط¯: ElevenLabs ط¨ظٹط±ط¬ظ‘ط¹ ط§ظ„ظ†طµ ظ…ط±ط© ظˆط§ط­ط¯ط© ظپظٹ
 *  ط§ظ„ط¢ط®ط± ظ…ظ† ط؛ظٹط± طھظ‚ط¯ظ‘ظ…طŒ ظˆط§ظ„ط±ظ‚ظ… ط§ظ„ظˆظ‡ظ…ظٹ ظƒط°ط¨ طµط±ظٹط­. ط§ظ„ظˆط­ظٹط¯ ط§ظ„ظ„ظٹ ط¨ظٹط¹ط±ط¶
 *  ظ†ط³ط¨ط© ظ‡ظˆ **ط§ظ„ط±ظپط¹** â€” ظˆط¯ظٹ ط­ظ‚ظٹظ‚ظٹط© 100% (ط¨ط§ظٹطھظ… ط¹ظ„ظ‰ ط§ظ„ظ…طھطµظپط­). */
type Stage = "preparing" | "uploading" | "transcribing" | "finalizing";

/** ًںژ« طھط°ظƒط±ط© ط§ظ„ظ…ظ„ظƒظٹط© ظ…ظ† ظ†ط§ط­ظٹط© ط§ظ„ط¹ظ…ظٹظ„ â€” ط§ظ„ظ„ظٹ ط¨ظٹطھط®ط²ظ† ظپظٹ ط§ظ„ط­ط§ظ„ط©.
 *  `secret` ظ…ظˆط¬ظˆط¯ ط¨ط³ ظ„ظ„ط²ط§ط¦ط± ط¨ظ„ط§ ط¬ظ„ط³ط© (ط¨ظٹطھط¨ط¹طھ ظ…ط¹ ظƒظ„ ظ†ط¯ط§ط، طھظپط±ظٹط؛ ط¨ط¯ظ„
 *  ط§ظ„ظƒظˆظƒظٹط²). ظ…ظ…ظ†ظˆط¹ ظٹط¸ظ‡ط± ظپظٹ ط£ظٹ ط±ط³ط§ظ„ط©/ظ„ظˆط¬/ط¹ظ†ظˆط§ظ†. */
type OwnershipTicket = {
  ticketId: string;
  secret: string | null;
};

/**
 * ط±ظپط¹ ط§ظ„ظ…ظ„ظپ **ظ…ط¨ط§ط´ط±ط©** ظ„ظ„طھط®ط²ظٹظ† ط¹ظ† ط·ط±ظٹظ‚ ط§ظ„ظ€ signed URL ط¨طھط§ط¹ ط§ظ„ط±ط§ظˆطھ.
 *
 * âڑ ï¸ڈ ظ„ظٹظ‡ `XMLHttpRequest` ظ…ط´ `fetch`: ط¹ط´ط§ظ† ظ†ط¹ط±ظپ ظ†ط³ط¨ط© ط§ظ„ط±ظپط¹ ط§ظ„ط­ظ‚ظٹظ‚ظٹط©.
 * `fetch` ظ…ط§ط¹ظ†ط¯ظ‡ط§ط´ progress events ظپظٹ ط§ظ„ظ…طھطµظپط­طŒ ظˆ`XMLHttpRequest.upload.onprogress`
 * ط¨ظٹط¨ط¹طھ ط§ظ„ط¨ط§ظٹطھط§طھ ط§ظ„ظ…ط±ظپظˆط¹ط© ظپط¹ظ„ط§ظ‹. ط§ظ„ظ†ط³ط¨ط© ط¯ظٹ **ظ…ط´ ظ…ط²ظٹظ‘ظپط©** â€” ط¯ظٹ ط§ظ„ط­ظ‚ظٹظ‚ظٹط©.
 * (ظ†ط³ط¨ط© ط§ظ„طھط­ظˆظٹظ„ ظ†ظپط³ظ‡ط§ ظ…ط´ ط¨طھطھط¹ط±ط¶ â€” ElevenLabs ظ…ط´ ط¨ظٹط¨ط¹طھ طھظ‚ط¯ظ‘ظ….)
 *
 * âڑ ï¸ڈ ط§ظ„طھظˆظƒظ† ظ„ط§ط²ظ… ظٹطھط¨ط¹طھ ظپظٹ ظ‡ظٹط¯ط± `x-upsert-token` ط­ط³ط¨ API Supabase.
 * ظ…ظ…ظ†ظˆط¹ ط£ظٹ ظ…ظپطھط§ط­ ط®ط¯ظ…ط© ظٹظˆطµظ„ ط§ظ„ظ…طھطµظپط­ â€” ط§ظ„ظ„ظٹ ط¨ظٹطھط¨ط¹طھ ط¯ظ‡ طھط°ظƒط±ط© ظ…ط¤ظ‚طھط©
 * ظ„ظ…ط³ط§ط± ظˆط§ط­ط¯ ط¨ط³.
 */
function uploadDirect(
  signedUrl: string,
  token: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert-token", token);
    // âڑ ï¸ڈ ظ„ط§ط²ظ…: ظ…ظ† ط؛ظٹط± content-type طµط­ظٹط­ Supabase ط¨ظٹط±ظپط¶ ط§ظ„ط·ظ„ط¨.
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      // Supabase ط¨ظٹط±ط¬ظ‘ط¹ 200 ط£ظˆ 201 ط¹ظ„ظ‰ ظ†ط¬ط§ط­ ط§ظ„ط±ظپط¹.
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.ontimeout = () => reject(new Error("upload_timeout"));
    // ظ…ظ‡ظ„ط© 4 ط³ط§ط¹ط§طھ: ظ…ط­ط§ط¶ط±ط© 3 ط³ط§ط¹ط§طھ ط¹ظ„ظ‰ ظ†طھ ط¨ط·ظٹط، ظ…ظ…ظƒظ† طھط§ط®ط¯ ظˆظ‚طھطŒ ظˆط§ظ„ظ„ظٹ
    // ظ…ط§ظ†ط¹ط¯ظ‘ظٹط´ ط³ط§ط¹طھظٹظ† ط¯ظٹ ظ…ط´ upload ticket TTL (ط³ط§ط¹طھظٹظ†) â€” ط¯ظ‡ طھظˆطµظٹظ„.
    xhr.timeout = 4 * 60 * 60 * 1000;

    xhr.send(file);
  });
}

/** ط§ط³طھط®ط±ط§ط¬ ط±ط³ط§ظ„ط© ط¹ط±ط¨ظٹط© ط¢ظ…ظ†ط© ظ…ظ† ط±ط¯ ط§ظ„ط±ط§ظˆطھ.
 *  ط§ظ„ط±ط§ظˆطھ ط¨ظٹط±ط¬ظ‘ط¹ `{ error: { code, message } }` â€” ظˆط§ظ„ط±ط³ط§ظ„ط© ظ…ظƒطھظˆط¨ط© ط¨ط§ظ„ط¹ط±ط¨ظٹ
 *  ظˆظ…ظپظ‡ظˆظ…ط© ظ„ظ„ط·ط§ظ„ط¨ ط¹ظ„ظ‰ ط·ظˆظ„. ظ„ظˆ ط§ظ„ط±ط¯ ظ…ط´ ط¨ط§ظ„ط´ظƒظ„ ط¯ظ‡ (ط¨ط±ظˆظƒط³ظٹ/5xx/HTML) ط¨ظ†ط±ط¬ط¹
 *  ظ„ظ„ط±ط³ط§ظ„ط© ط§ظ„ط¹ط§ظ…ط© ط¨ط¯ظ„ ظ…ط§ ظ†ط¹ط±ط¶ `undefined` ط£ظˆ JSON ط®ط§ظ…. */
function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}

/** ط§ط³ظ… ظ…ظ„ظپ ط§ظ„طھظ†ط²ظٹظ„: ط§ط³ظ… ط§ظ„ظ…ط­ط§ط¶ط±ط© ط§ظ„ط£طµظ„ظٹ + .txt
 *  ط¨ظ†ظ†ط¶ظ‘ظپ ط§ظ„ظ…ط­ط§ط±ظپ ط§ظ„ظ„ظٹ ظ…ط´ ط¢ظ…ظ†ط© ظپظٹ ط£ط³ظ…ط§ط، ط§ظ„ظ…ظ„ظپط§طھ ط¹ظ„ظ‰ ظˆظٹظ†ط¯ظˆط². */
function downloadFilename(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, " ").trim();
  const safe = (base || "ظ…ط­ط§ط¶ط±ط©").slice(0, 60);
  return `${safe}.txt`;
}

/** ط§ظ„ظ…ط¯ط© ط¨ط§ظ„ط«ظˆط§ظ†ظٹ â†’ "12:34" ط£ظˆ "1:05:20" */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * ًں“ڑ ط­ط§ظ„ط© ط­ظپط¸ ط§ظ„ظ…ط­ط§ط¶ط±ط© ظƒظ…ط§ ط±ط¬ط¹طھ ظ…ظ† ط§ظ„ط³ظٹط±ظپط±.
 *
 * `saved` ط¨ظٹظˆطµظپ **ط§ظ„ط­ظپط¸** ط¨ط³ â€” ظ…ط´ ظ†ط¬ط§ط­ ط§ظ„طھظپط±ظٹط؛. ط§ظ„طھظپط±ظٹط؛ ظ†ط¬ط­ ظپظٹ ظƒظ„
 * ط§ظ„ط£ط­ظˆط§ظ„طŒ ظˆط§ظ„ظپط±ظ‚ ظ‡ظˆ ط¥ظ† ط§ظ„ظ…ط­ط§ط¶ط±ط© ط§طھط±ط¨ط·طھ ط¨ط­ط³ط§ط¨ ط§ظ„ظ…ط³طھط®ط¯ظ… ظˆظ„ط§ ظ„ط£.
 */
type SaveInfo =
  | { saved: true; lectureId: string }
  | { saved: false; persistCode?: string; persistMessage?: string };

/**
 * ًں“ڑ ظٹظ‚ط±ط§ ط­ط§ظ„ط© ط§ظ„ط­ظپط¸ ظ…ظ† ط±ط¯ ط§ظ„ط±ط§ظˆطھ.
 *
 * âڑ ï¸ڈ **ظ…طھط­ط°ظ‘ط± ط¹ظ…ط¯ط§ظ‹**: `saved` ط¨ظٹطھط­ط³ط¨ ظ…ظ† `lectureId` **ظ…ط´** ظ…ظ†
 * `payload.saved` ظ„ظˆط­ط¯ظ‡. ط§ظ„ط³ط¨ط¨ ط¥ظ†ط§ ظ„ط§ط²ظ… ظ†طھط¹ط§ظ…ظ„ ظ…ط¹ ط±ط¯ ظ†ط§ظ‚طµ/ظ‚ط¯ظٹظ… ط¨ط£ظ…ط§ظ† â€”
 * ظ„ظˆ ط§ظ„ط³ظٹط±ظپط± ط±ط¬ط¹ `saved: true` ظ…ظ† ط؛ظٹط± `lectureId` (ظٹط¹ظ†ظٹ ظ…ط§ظپظٹط´ ط³ط·ط±
 * ط§طھظƒطھط¨ ظپط¹ظ„ط§ظ‹) ظپط§ظ„ظ…ظƒظˆظ‘ظ† ظ‡طھطµط¯ظ‘ظ‚ظ‡ ظˆظٹظ‚ظˆظ„ ظ„ظ„ط·ط§ظ„ط¨ آ«ط§طھط­ظپط¸طھآ» ظˆظ‡ظٹ ظ…ط§ط§طھط­ظپط¸طھط´.
 * ط§ظ„ظ…ط¹ط±ظ‘ظپ ظ‡ظˆ ط§ظ„ط¯ظ„ظٹظ„ ط§ظ„ظˆط­ظٹط¯ ط§ظ„ظ„ظٹ ظ…ط´ ط¨ظٹظƒط°ط¨.
 */
function readSaveInfo(payload: unknown): SaveInfo {
  const p = (payload ?? {}) as Record<string, unknown>;
  const lectureId = p.lectureId;
  if (typeof lectureId === "string" && lectureId !== "") {
    return { saved: true, lectureId };
  }
  return {
    saved: false,
    persistCode: typeof p.persistCode === "string" ? p.persistCode : undefined,
    persistMessage:
      typeof p.persistMessage === "string" ? p.persistMessage : undefined,
  };
}

/** ط§ظ„ظ…ظƒظˆظ‘ظ† ط§ظ„ط±ط¦ظٹط³ظٹ â€” ظƒظ„ ط­ط§ظ„ط© ط§ظ„ط´ط§ط´ط© ظپظٹ ظ…طھط؛ظٹط±ط§طھ ظˆط§ط­ط¯ط© ظˆط§ط¶ط­ط©. */
export function LectureTranscriber() {
  const [file, setFile] = useState<File | null>(null);

// ًں§، ط§ط³ظ… ط§ظ„ظ…ظ„ظپ ط§ظ„ط£طµظ„ظٹ ظ‚ط¨ظ„ ط§ظ„ط¶ط؛ط· (ظ„ظ„ط¹ط±ط¶ ظˆط§ط­ط¯)
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [preparePercent, setPreparePercent] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LectureTranscript | null>(null);
  const [copied, setCopied] = useState(false);
  /** ط§ظ„ظ…ط±ط­ظ„ط© ط§ظ„ط¬ط§ط±ظٹط© ظ…ظ† ط§ظ„ط´ط؛ظ„ â€” ط¨طھطھط­ظƒظ… ظپظٹ ظ†طµ ط§ظ„طھط­ظ…ظٹظ„. */
  const [stage, setStage] = useState<Stage>("uploading");
  /** ظ†ط³ط¨ط© ط±ظپط¹ **ط­ظ‚ظٹظ‚ظٹط©** (0..100). ظ…ط´ ط¨طھطھط­ط±ظƒ ط£ط«ظ†ط§ط، ط§ظ„طھط­ظˆظٹظ„ ط®ط§ظ„طµ â€”
   *  ElevenLabs ظ…ط´ ط¨ظٹط¨ط¹طھ طھظ‚ط¯ظ‘ظ…طŒ ظˆط¥ظٹظ‡ط§ظ… ط§ظ„ط·ط§ظ„ط¨ ط¨ظ†ط³ط¨ط© ظ‡ظ†ط§ ظƒط°ط¨. */
  const [uploadPercent, setUploadPercent] = useState(0);
  /** ط§ظ„ظ…ظ„ظپ ط§ظ„ط£طµظ„ظٹ ط§ظ„ظ…ط®طھط§ط± â€” ظ…ط­طھظپط¸ ط¨ظٹظ‡ ظ„ط¥ط¹ط§ط¯ط© ط§ظ„طھط¬ظ‡ظٹط² ط§ظ„ظٹط¯ظˆظٹط© ظ…ظ† ط¨ط·ط§ظ‚ط©
   *  ط§ظ„ط§ط³طھط±ط¯ط§ط¯. âڑ ï¸ڈ ظ…ط´ ط¨ظٹطھط±ظپط¹ ط£ط¨ط¯ظ‹ط§ ط¥ظ„ط§ ط¨ط¹ط¯ ظ…ط§ ط§ظ„ط¶ط؛ط· ظٹظ†ط¬ط­: ظپط±ط¹ ط§ظ„ظپط´ظ„
   *  ط¨ظٹظ…ط³ط­ `file` ظ„ظƒظ† ط¨ظٹط³ظٹط¨ ط¯ظ‡ ظ„ظ„ط¶ط؛ط·ط© ط§ظ„ط¬ط§ظٹط© ظپظ‚ط·. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** ط¹ط¯ط¯ ظ…ط­ط§ظˆظ„ط§طھ ط§ظ„طھط¬ظ‡ظٹط² ط§ظ„ظٹط¯ظˆظٹط© ظ„ظ„ظ…ظ„ظپ ط§ظ„ط­ط§ظ„ظٹ â€” ط¨طھطھطµظپظ‘ط± ظ…ط¹ ظƒظ„ ط§ط®طھظٹط§ط± ط¬ط¯ظٹط¯.
   *  âڑ ï¸ڈ ط§ظ„ط³ظ‚ظپ ظپظٹ `MAX_MANUAL_RETRIES` ط¹ط´ط§ظ† ظ…ط§ظپظٹط´ ط­ظ„ظ‚ط§طھ ظ…ظƒظ„ظپط©:
   *  ط¨ط¹ط¯ظ‡ط§ ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ ط¨طھط®ظپظٹ ط²ط± ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط©. */
  const [prepareAttempts, setPrepareAttempts] = useState(0);
  /** ظƒظˆط¯ ط§ظ„ظپط´ظ„ ط§ظ„ط£ط®ظٹط± (`failCode`) â€” ط¨ظٹط­ط¯ظ‘ط¯ ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ ط§ظ„ظ…ط¹ط±ظˆط¶ط©.
   *  âڑ ï¸ڈ ظƒظˆط¯ ط«ط§ط¨طھ ط¨ظ„ط§ ط£ظٹ ط¨ظٹط§ظ†ط§طھ ظ…ط³طھط®ط¯ظ…: ظ„ط§ ط§ط³ظ… ظ…ظ„ظپ ظˆظ„ط§ ط­ط¬ظ… ظˆظ„ط§ ط±ظˆط§ط¨ط·. */
  const [failureCode, setFailureCode] = useState<string | null>(null);
  /** طھط­ط°ظٹط± ظ„ظ„ظ…ظ„ظپط§طھ ط§ظ„ظƒط¨ظٹط±ط© ط؛ظٹط± MP3 â€” ظ‚ط¨ظ„ ظ…ط§ ظٹط¯ط®ظ„ظˆط§ ط§ظ„ط¶ط؛ط· (ffmpeg). */
  const [largeFileWarning, setLargeFileWarning] = useState<string | null>(null);
  /** ظ…ط³ط§ط± ط§ظ„ظ…ظ„ظپ **ط¨ط¹ط¯** ظ…ط§ ط§طھط±ظپط¹ ظپط¹ظ„ط§ظ‹.
   *  âڑ ï¸ڈ ط¯ظ‡ ط§ظ„ظ„ظٹ ط¨ظٹط®ظ„ظ‘ظٹ ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط© ظ…ظ…ظƒظ†ط© ظ…ظ† ط؛ظٹط± ط±ظپط¹ طھط§ظ†ظٹ: ظ„ظˆ ظپط´ظ„
   *  ط§ظ„طھظپط±ظٹط؛طŒ ط§ظ„ط®ط§ط¯ظ… ط³ظٹط¨ ط§ظ„ظ…ظ„ظپ ظپظٹ ظ…ظƒط§ظ†ظ‡ (ط¨ظٹط­ط°ظپظ‡ ط¨ط¹ط¯ ط§ظ„ظ†ط¬ط§ط­ ط¨ط³)طŒ
   *  ظپط§ظ„ط·ط§ظ„ط¨ ظٹظ‚ط¯ط± ظٹط¯ظˆط³ آ«ط­ط§ظˆظ„ طھط§ظ†ظٹآ» ظˆظٹظƒظ…ظ‘ظ„ ظ…ظ† ظ†ظپط³ ط§ظ„ظ…ظ„ظپ. */
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  /** ًںژ« طھط°ظƒط±ط© ط§ظ„ظ…ظ„ظƒظٹط© ط§ظ„ظ…ط±طھط¨ط·ط© ط¨ط§ظ„ظ…ط³ط§ط± ط§ظ„ظ…ط±ظپظˆط¹ â€” ط¥ظ„ط²ط§ظ…ظٹط© ظپظٹ ط£ظٹ ظ†ط¯ط§ط،
   *  ظ„ظ€ /transcribe (ط§ظ„ط®ط§ط¯ظ… ظ…ط´ ط¨ظٹظ‚ط¨ظ„ ظ…ط³ط§ط± ظ…ظ† ط؛ظٹط±ظ‡ط§). ط¨طھطھظ…ط³ط­ ظ…ط¹ ط§ظ„ظ…ط³ط§ط±
   *  ظپظٹ ظ†ظپط³ ط§ظ„ط£ظ…ط§ظƒظ† ط¨ط§ظ„ط¸ط¨ط· ط¹ط´ط§ظ† ط§ظ„ط§طھظ†ظٹظ† ظٹظپط¶ظ„ظˆط§ ظ…طھط²ط§ظ…ظ†ظٹظ† ط¯ط§ظٹظ…ظ‹ط§. */
  const [uploadTicket, setUploadTicket] = useState<OwnershipTicket | null>(null);
  /** ًں“ڑ ظ†طھظٹط¬ط© ط­ظپط¸ ط§ظ„ظ…ط­ط§ط¶ط±ط© (ط§ظ„ظ…ط±ط­ظ„ط© ظ£).
   *
   *  âڑ ï¸ڈ ط¯ظٹ **ظ…ط´** ظ†ظپط³ `phase`: ط¯ظٹ ط¨طھظ‚ظˆظ„ آ«ط§ظ„طھظپط±ظٹط؛ ظ†ط¬ط­طŒ ط¨ط³ ط§ظ„ظ…ط­ط§ط¶ط±ط©
   *  ط§طھط­ظپط¸طھ ظˆظ„ط§ ظ„ط£آ». ط§ظ„ظپطµظ„ ط¯ظ‡ ظ…ظ‚طµظˆط¯ â€” ط§ظ„طھظپط±ظٹط؛ ظ…ظ…ظƒظ† ظٹظ†ط¬ط­ ظ،ظ ظ ظھ ظˆط§ظ„ط­ظپط¸
   *  ظٹظپط´ظ„طŒ ظˆط§ظ„ظ†طµ ظٹظپط¶ظ„ ظ…ط¹ط±ظˆط¶ ظپظٹ ط§ظ„ط­ط§ظ„طھظٹظ†. `null` = ظ„ط³ظ‡ ظ…ط§ظ„ظˆط´ ط®ط¨ط±
   *  (ط§ظ„ظ…ط³ط§ط± ط§ظ„ظ‚ط¯ظٹظ… ط§ظ„ظ„ظٹ ظ…ط´ ط¨ظٹط­ظپط¸ ط£طµظ„ط§ظ‹).
   */
  const [saveInfo, setSaveInfo] = useState<SaveInfo | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const working = phase === "working";

  /** ظٹظپطھط­ ظ…ظ†طھظ‚ظٹ ط§ظ„ظ…ظ„ظپط§طھ ظ…ظ† ط²ط±ط§ط± ط§ظ„ظ€ dropzone. */
  const openPicker = useCallback(() => {
    if (!working) inputRef.current?.click();
  }, [working]);

  /** ظٹط®طھط§ط± ظ…ظ„ظپ (ظ…ظ† ط³ط­ط¨/ط¥ظپظ„ط§طھ ط£ظˆ ظ…ظ† ط§ظ„ظ…ظ†طھظ‚ظٹ) ظˆظٹظپط­طµظ‡ ظپظˆط±ط§ظ‹.
   *  ط§ظ„ظپط­طµ ظ‡ظ†ط§ ظ…ط´ ط¨ط¯ظٹظ„ ط¹ظ† ظپط­طµ ط§ظ„ط±ط§ظˆطھ â€” ط¯ظ‡ ط¨ط³ ط¹ط´ط§ظ† ط§ظ„ط·ط§ظ„ط¨ ظٹط´ظˆظپ ط§ظ„ط±ط³ط§ظ„ط©
   *  ظ‚ط¨ظ„ ظ…ط§ ظ†ط±ظپط¹ ط£ظٹ ط­ط§ط¬ط©. */
  const selectFile = useCallback(
    async (next: File | null | undefined) => {
      if (!next) {
        setError(ERR_NO_FILE);
        setPhase("error");
        return;
      }

      try {
        assertLectureFile(next);
      } catch (validationError) {
        setFailureCode("file.invalid");
        setError(
          failCode(
            "file.invalid",
            validationError instanceof TranscriptionError
              ? validationError.message
              : ERR_GENERIC,
          ),
        );
        setPhase("error");
        return;
      }

      // ًں§¾ Phase: ط¶ط؛ط· ظ‚ط¨ظ„ ط§ظ„ط±ظپط¹ â€” Supabase ط¹ظ„ظ‰ ط§ظ„ط¨ط§ظ‚ط© ط§ظ„ظ…ط¬ط§ظ†ظٹط© ط¨ظٹظ‚ظپ ط¹ظ†ط¯ 50MB.
      //   ط§ظ„ظ…ظ„ظپ ط§ظ„ط£ظƒط¨ط± ظ…ظ† 45MB ط¨ظٹطھط­ظˆظ„ ظ„طµظˆطھ MP3 ظ‚ط¨ظ„ ط£ظٹ ط±ظپط¹. ط§ظ„ظ„ظٹ ط¨ظٹطھط­ظپط¸
      //   ظ‡ظ†ط§ ظ‡ظˆ **ط§ظ„ظ…ظ„ظپ ط§ظ„ظ…ط¹ط§ظ„ط¬**طŒ ظ„ط£ظ† ط¯ظ‡ ط§ظ„ظ„ظٹ ط¨ظٹط±ظپط¹.
      const sourceName = next.name;
      const sourceSize = next.size;

      // âڑ ï¸ڈ طھط­ط°ظٹط± ظ„ظ„ظ…ظ„ظپط§طھ ط§ظ„ظƒط¨ظٹط±ط© ط؛ظٹط± MP3 â€” ظ„ظˆ ط§ظ„ط±ظپط¹ ظپط´ظ„طŒ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ„ط§ط²ظ… ظٹط¶ط؛ط· ط§ظ„ظ…ظ„ظپ ظ…ظ† طھظ„ظٹظپظˆظ†ظ‡.
      const MAX_WARN_BYTES = 45 * 1024 * 1024;
      const isLossyAudio = /^audio\/(mpeg|mp3)$/i.test(next.type);
      if (next.size > MAX_WARN_BYTES && !isLossyAudio) {
        setLargeFileWarning(
          "ط§ظ„ظ…ظ„ظپ ط£ظƒط¨ط± ظ…ظ† 45 ظ…ظٹط¬ط§. ظ„ظˆ ط§ظ„ط±ظپط¹ ظپط´ظ„طŒ ظپط¶ظ„ظ‹ط§ ط§ط¶ط؛ط· ط§ظ„ظ…ظ„ظپ ظ…ظ† ظ‡ط§طھظپظƒ ط¨ط§ط³طھط®ط¯ط§ظ… ط£ظٹ طھط·ط¨ظٹظ‚ ط¶ط؛ط· طµظˆطھ ظˆط­ط§ظˆظ„ طھط§ظ†ظٹ."
        );
      } else {
        setLargeFileWarning(null);
      }

      // âڑ ï¸ڈ ظپط­طµ ط­ط¯ ط§ظ„ط¬ظ‡ط§ط² ظ‚ط¨ظ„ ط§ظ„ط¶ط؛ط· â€” ط¥ط°ط§ ظƒط§ظ† ط§ظ„ظ…ظ„ظپ ط£ظƒط¨ط± ظ…ظ† ط­ط¯ ط§ظ„ط¬ظ‡ط§ط²طŒ ط§ط¹ط±ط¶ ط®ط·ط£ ظˆطھظˆظ‚ظپ.
      const deviceLimit = getDeviceLimit();
      if (next.size > deviceLimit) {
        setError(
          `ط§ظ„ظ…ظ„ظپ ${Math.round(next.size / 1024 / 1024)} ظ…ظٹط¬ط§ â€” ط£ظƒط¨ط± ظ…ظ† ط§ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ ظ„ط¬ظ‡ط§ط²ظƒ (${Math.round(
            deviceLimit / 1024 / 1024,
          )} ظ…ظٹط¬ط§). ظ…ظ…ظƒظ† طھط¶ط؛ط·ظ‡ ط¨ظ†ظپط³ظƒ ظ…ظ† ظ‡ط§طھظپظƒطŒ ط£ظˆ ظ‚ط³ظ…ظ‡ ظ„ظ…ط­ط§ط¶ط±طھظٹظ†.`
        );
        setPhase("error");
        return;
      }

      if (!needsCompression(next)) {
        // âڈ­ï¸ڈ ظ…ظ„ظپ طµط؛ظٹط±: ظ†ظپط³ ط§ظ„ظ…ط³ط§ط± ط§ظ„ظ‚ط¯ظٹظ… ط¨ط§ظ„ط¸ط¨ط·طŒ ظˆظ…ظ† ط؛ظٹط± طھط­ظ…ظٹظ„ FFmpeg.
        setFile(next);
        setPendingFile(null);
        setPrepareAttempts(0);
        setFailureCode(null);
        setOriginalName(sourceName);
        setOriginalSize(0);
        setError(null);
        setTranscript(null);
        setCopied(false);
        setPhase("idle");
        setUploadedPath(null);
        setUploadTicket(null);
        setUploadPercent(0);
        return;
      }

      /* ًں§¾ طھطھط¨ظ‘ط¹ ط¥ط¹ط§ط¯ط© ط§ظ„طھط¬ظ‡ظٹط² ط§ظ„ظٹط¯ظˆظٹط©: ط§ط®طھظٹط§ط± ط¬ط¯ظٹط¯ = ط¹ط¯ظ‘ط§ط¯ ط¬ط¯ظٹط¯.
         âڑ ï¸ڈ ط§ظ„ط¶ط؛ط·ط© ط§ظ„ظˆط§ط­ط¯ط© طھط´ط؛ظ‘ظ„ ظ…ط­ط§ظˆظ„ط© ظˆط§ط­ط¯ط© ط¨ط³ط› ط§ظ„ط³ظ‚ظپ ظپظٹ `MAX_MANUAL_RETRIES`
         ظˆط¨طھطھط­ظƒظ… ظپظٹظ‡ ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ (ط²ط± ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط© ط¨ظٹط®طھظپظٹ ط¨ط¹ط¯ظ‡). */
      setPendingFile(next);
      setPrepareAttempts((attempts) => attempts + 1);
      setFailureCode(null);
      setPreparing(true);
      setPreparePercent(0);
      setPhase("working");
      setStage("preparing");
      setError(null);

      try {
        const result = await compressLectureMedia(next, (progress) => {
          setPreparePercent(Math.round(progress.ratio * 100));
        });
        setFile(result.file);
        setOriginalName(sourceName);
        setOriginalSize(sourceSize);
        setTranscript(null);
        setCopied(false);
        setPhase("idle");
        setUploadedPath(null);
        setUploadTicket(null);
        setUploadPercent(0);
      } catch (preparationError) {
        // â‌Œ ظ…ط¨ظ†ط±ظپط¹ط´ ط§ظ„ظ…ظ„ظپ ط§ظ„ط£طµظ„ظٹ: ط­ط¬ظ…ظ‡ ظ‡ظٹط¹ط¯ظ‘ظٹ ط­ط¯ Supabase.
        setFile(null);
        setOriginalName(null);
        setOriginalSize(0);
        /* ًں”ژ ظƒظˆط¯ ط§ظ„ظپط±ط¹ ط¨ظٹط­ط¯ظ‘ط¯ ط£ظٹظ† ظˆظ‚ظپ ط§ظ„ط¶ط؛ط·: ظ‚ط±ط§ط،ط© ط§ظ„ظ…ط¯ط© (`prep.duration`)
            ظˆظ„ط§ طھظ†ظپظٹط° ffmpeg (`prep.exec`) ظˆظ„ط§ ط§ظ„ط­ط¬ظ… ط§ظ„ظ†ظ‡ط§ط¦ظٹ (`prep.too_long`)
            ظˆظ„ط§ طھط­ظ…ظٹظ„ ط§ظ„ظ…ط­ط±ظ‘ظƒ/ظƒطھط§ط¨ط© ط§ظ„ظ…ظ„ظپ (`prep.other`). ط§ظ„ط£ط³ظ…ط§ط، ط¯ظٹ ط¨ط³ â€”
            ط¨ظ„ط§ ط£ظٹ ط¨ظٹط§ظ†ط§طھ ظ…ط³طھط®ط¯ظ…. */
        const reason =
          preparationError instanceof Error ? preparationError.message : "";
        const code =
          reason === "still_too_large"
            ? "prep.too_long"
            : reason === "bad_duration"
              ? "prep.duration"
              : reason === "bad_media"
                ? "prep.media"
                : reason === "no_dom"
                  ? "prep.no_dom"
                  : reason.startsWith("ffmpeg_exit_")
                    ? "prep.exec"
                    : "prep.other";
        setError(
          failCode(
            code,
            reason === "still_too_large"
              ? "ط§ظ„ظ…ط­ط§ط¶ط±ط© ط·ظˆظٹظ„ط© ط£ظˆظٹ ظˆط­ط¬ظ…ظ‡ط§ ظƒط¨ظٹط± ط¨ط¹ط¯ ط§ظ„ط¶ط؛ط·. ط¬ط±ط¨ طھظ‚ط³ظ‘ظ…ظ‡ط§ ط¹ظ„ظ‰ ظ…ظ„ظپظٹظ†."
              : "ظ…ظ‚ط¯ط±ظ†ط§ط´ ظ†ط¬ظ‡ظ‘ط² ط§ظ„ظ…ظ„ظپ ط¯ظ‡. ط¬ط±ظ‘ط¨ ظ…ظ„ظپ طھط§ظ†ظٹ ط£ظˆ ط£ط¹ط¯ ط§ظ„ظ…ط­ط§ظˆظ„ط©.",
          ),
        );
        setFailureCode(code);
        setPhase("error");
      } finally {
        setPreparing(false);
      }
    },
    [],
  );

  /** ظٹظ†ظپظ‘ط° ط¥ط¬ط±ط§ط، ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ ط§ظ„ظ…ط®طھط§ط± â€” ظƒظ„ ط¥ط¬ط±ط§ط، ط­ظ‚ظٹظ‚ظٹ ط¨ظ„ط§ ط§ط³طھط«ظ†ط§ط،:
   *  - `retry-prepare`: ظٹط¹ظٹط¯ ط§ظ„طھط¬ظ‡ظٹط² ظƒط§ظ…ظ„ظ‹ط§ ط¹ظ„ظ‰ ط§ظ„ظ…ظ„ظپ ط§ظ„ظ…ط­ظپظˆط¸ (ظ…ط­ط§ظˆظ„ط© ظٹط¯ظˆظٹط© ظˆط§ط­ط¯ط©).
   *  - `pick-smaller`: ظٹظپطھط­ ظ…ظ†طھظ‚ظٹ ط§ظ„ظ…ظ„ظپط§طھ ظ„ط§ط®طھظٹط§ط± ظ†ط³ط®ط© ط£ط®ظپ.
   *  - `split-guide`: ظ„ط§ ط¥ط¬ط±ط§ط، â€” ط§ظ„طھط¹ظ„ظٹظ…ط§طھ ط§ظ„ظƒط§ظ…ظ„ط© ظ…ط¹ط±ظˆط¶ط© ط£طµظ„ظ‹ط§ ظپظٹ طھظپط§طµظٹظ„ ط§ظ„ط®ظٹط§ط±.
   *  - `paste-text`: ط±ط§ط¨ط· ط­ظ‚ظٹظ‚ظٹ ظ„طµظپط­ط© `/ai-studio` (ظٹظڈط±ط³ظژظ… ظپظٹ ط§ظ„ط¨ط·ط§ظ‚ط© ظ†ظپط³ظ‡ط§). */
  const handleRecovery = useCallback(
    (action: RecoveryAction) => {
      if (action === "retry-prepare") {
        const target = pendingFile;
        if (!target || working) return;
        void selectFile(target);
      } else if (action === "pick-smaller") {
        openPicker();
      }
    },
    [pendingFile, working, selectFile, openPicker],
  );

  /** ظٹظ…ط³ط­ ط§ظ„ط§ط®طھظٹط§ط± ظˆظٹط±ط¬ظ‘ط¹ ط§ظ„ط´ط§ط´ط© ظ„ط­ط§ظ„طھظ‡ط§ ط§ظ„ط£ظˆظ„ظ‰. */
  const reset = useCallback(() => {
    setFile(null);
    setTranscript(null);
    setError(null);
    setCopied(false);
    setPhase("idle");
    setUploadedPath(null);
    setUploadTicket(null);
    setUploadPercent(0);
    setPendingFile(null);
    setPrepareAttempts(0);
    setFailureCode(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /** ظ…ط³ط§ط± ط§ظ„ظ…ط±ط­ظ„ط© 1 ط§ظ„ظ‚ط¯ظٹظ…: ط§ظ„ظ…ظ„ظپ ظپظٹ ط¬ط³ظ… ط·ظ„ط¨ ط§ظ„ظپط§ظ†ظƒط´ظ†.
   *  ط¨ظٹط´طھط؛ظ„ ظ„ظ„ظ…ظ„ظپط§طھ ط§ظ„طµط؛ظٹط±ط© ط¨ط³ (ط£ظˆ ظ„ظ…ط§ Supabase Storage ظ…ط´ ظ…ظ‡ظٹظ‘ط£).
   *  ظ…ط­ظپظˆط¸ ط²ظٹ ظ…ط§ ظ‡ظˆ â€” ط§ظ„ظ…ط±ط­ظ„ط© 1 ظ…ط´ ظ…ظپظ‚ظˆط¯ط©. */
  const runDirect = useCallback(async () => {
    if (!file) return;

    setPhase("working");
    setStage("transcribing");
    setError(null);
    setTranscript(null);
    setCopied(false);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/lecture-transcription", {
        method: "POST",
        body,
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setFailureCode("direct.http");
        setError(failCode("direct.http", extractErrorMessage(payload, ERR_GENERIC)));
        setPhase("error");
        return;
      }

      const result = (payload as { transcript?: LectureTranscript } | null)?.transcript;
      if (!result || typeof result.text !== "string" || result.text.trim() === "") {
        setFailureCode("direct.bad_response");
        setError(failCode("direct.bad_response", ERR_GENERIC));
        setPhase("error");
        return;
      }

      setTranscript(result);
      setPhase("done");
    } catch {
      setFailureCode("net.direct");
      setError(failCode("net.direct", ERR_NETWORK));
      setPhase("error");
    }
  }, [file]);

  /**
   * ط§ظ„ط®ط·ظˆط© ظ£/ظ¤: طھظپط±ظٹط؛ ظ…ظ„ظپ **ظ…طھط±ظˆظپط¹ ط¨ط§ظ„ظپط¹ظ„** + ط¹ط±ط¶ ط§ظ„ظ†طھظٹط¬ط©.
   *
   * ظ…ظ†ظپطµظ„ط© ط¹ظ† `run` ط¹ط´ط§ظ† ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط© ط¨ط¹ط¯ ظپط´ظ„ طھظپط±ظٹط؛ طھط±ط¬ط¹ ظ„ ظ‡ظ†ط§
   * ط¹ظ„ظ‰ ط·ظˆظ„ â€” ظ…ظ† ط؛ظٹط± ظ…ط§ ظ†ط·ظ„ط¨ طھط°ظƒط±ط© ط¬ط¯ظٹط¯ط© ظˆظ„ط§ ظ†ط±ظپط¹ 200 ظ…ظٹط¬ط§ طھط§ظ†ظٹ.
   *
   * ًںژ« ط¨طھط§ط®ط¯ طھط°ظƒط±ط© ط§ظ„ظ…ظ„ظƒظٹط© ط¨طھط§ط¹ط© ط§ظ„ظ…ط³ط§ط± â€” ط§ظ„ط®ط§ط¯ظ… ظ…ط´ ط¨ظٹظ‚ط¨ظ„ ط§ظ„ظ…ط³ط§ط±
   * ظ…ظ† ط؛ظٹط±ظ‡ط§ (ط¯ظ‡ ظ‡ظˆ ط¥ط؛ظ„ط§ظ‚ IDOR ظ†ظپط³ظ‡).
   */
  const transcribeUploaded = useCallback(
    async (path: string, ticket: OwnershipTicket | null) => {
      setStage("transcribing");
      setUploadPercent(100);

      const response = await fetch("/api/lecture-transcription/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          filename: file?.name ?? "ظ…ط­ط§ط¶ط±ط©",
          size: file?.size ?? 0,
          ticketId: ticket?.ticketId ?? "",
          ...(ticket?.secret ? { secret: ticket.secret } : {}),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        /* ًںژ« 404 = ط§ظ„ط±ط¯ ط§ظ„ظ…ظˆط­ط¯: ط§ظ„طھط°ظƒط±ط© ط؛ظ„ط·/ظ…ط´ ط¨طھط§ط¹طھظƒ/ظ…ظ†طھظ‡ظٹط©/ظ…ط³طھظ‡ظ„ظƒط©.
           ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط© ط¨ظ†ظپط³ ط§ظ„طھط°ظƒط±ط© ظ…ط³طھط­ظٹظ„ط© â€” ط¨ظ†ظ…ط³ط­ ط§ظ„ظ…ط³ط§ط± ظˆط§ظ„طھط°ظƒط±ط©
           ط¹ط´ط§ظ† ط§ظ„ط²ط± ظٹط±ط¬ط¹ آ«طھط­ظˆظٹظ„ ط¥ظ„ظ‰ ظ†طµآ» ظˆط§ظ„ط±ظپط¹ ظٹط¨ط¯ط£ ظ…ظ† ط¬ط¯ظٹط¯. */
        if (response.status === 404) {
          setUploadedPath(null);
          setUploadTicket(null);
          setFailureCode("transcribe.ticket_invalid");
          setError(
            failCode(
              "transcribe.ticket_invalid",
              extractErrorMessage(payload, ERR_TICKET_INVALID),
            ),
          );
          setPhase("error");
          return false;
        }
        /* 423 = ظپظٹظ‡ طھظپط±ظٹط؛ ط¬ط§ط±ظٹ ط¹ظ„ظ‰ ظ†ظپط³ ط§ظ„ظ…ظ„ظپ (ط§ظ„ظ…ط§ظ„ظƒ طµط­). ط§ظ„طھط°ظƒط±ط© ظ„ط³ظ‡
           ط³ظ„ظٹظ…ط© â€” ط¨ظ†ط³ظٹط¨ ط§ظ„ظ…ط³ط§ط± ظˆط§ظ„طھط°ظƒط±ط© ط¹ط´ط§ظ† آ«ط­ط§ظˆظ„ طھط§ظ†ظٹآ» ظٹط´طھط؛ظ„ ط¨ط¹ط¯ ط´ظˆظٹط©.
           ط£ظٹ ظپط´ظ„ طھط§ظ†ظٹ: ظ†ظپط³ ط§ظ„ط³ظ„ظˆظƒ ط§ظ„ظ‚ط¯ظٹظ… â€” ط§ظ„ظ…ظ„ظپ ظ„ط³ظ‡ ظ…ط±ظپظˆط¹ (ط§ظ„ط®ط§ط¯ظ…
           ط¨ظٹط­ط°ظپظ‡ ط¨ط¹ط¯ ط§ظ„ظ†ط¬ط§ط­ ط¨ط³)طŒ ظپط¨ظ†ط³ظٹط¨ `uploadedPath` ظ…طھط³ط¬ظ‘ظ„طŒ ظˆط§ظ„ط²ط±
           ط¨ظٹط±ط¬ط¹ ظ„ظ€ آ«ط­ط§ظˆظ„ طھط§ظ†ظٹآ» ظˆظٹظƒظ…ظ‘ظ„ ظ…ظ† ظ†ظپط³ ط§ظ„ظ…ظ„ظپ. */
        setFailureCode("transcribe.http");
        setError(failCode("transcribe.http", extractErrorMessage(payload, ERR_GENERIC)));
        setPhase("error");
        return false;
      }

      setStage("finalizing");
      const result = (payload as { transcript?: LectureTranscript } | null)?.transcript;
      if (!result || typeof result.text !== "string" || result.text.trim() === "") {
        setFailureCode("transcribe.bad_response");
        setError(failCode("transcribe.bad_response", ERR_GENERIC));
        setPhase("error");
        return false;
      }

      /* ًں“ڑ ط­ط§ظ„ط© ط§ظ„ط­ظپط¸ â€” ط¨طھطھظ‚ط±ظٹ ظ…ظ† ظ†ظپط³ ط§ظ„ط±ط¯ (ط§ظ„ظ…ط±ط­ظ„ط© ظ£).
       *
       * ًںژ« ط§ظ„طھط°ظƒط±ط© ط§ط³طھظڈظ‡ظ„ظƒطھ ظ…ط¹ ظ†ط¬ط§ط­ ط§ظ„طھظپط±ظٹط؛ ظ†ظپط³ظ‡ (ط­طھظ‰ ظ„ظˆ ط§ظ„ط­ظپط¸ ظپط´ظ„
       * ط¨ط¹ط¯ظ‡ط§ â€” ط³ظٹظ†ط§ط±ظٹظˆ 14): ط§ظ„ط®ط§ط¯ظ… ط±ط¬ظ‘ط¹ ط§ظ„ظ†طµطŒ ظپط£ظٹ آ«ط­ط§ظˆظ„ طھط§ظ†ظٹآ» ط¹ظ„ظ‰ ظ†ظپط³
       * ط§ظ„طھط°ظƒط±ط© ظ‡ظٹط±ط¬ط¹ 404. ط¨ظ†ظ…ط³ط­ ط§ظ„ظ…ط³ط§ط± ظˆط§ظ„طھط°ظƒط±ط© ظپظٹ ط§ظ„ط­ط§ظ„طھظٹظ† ط¹ط´ط§ظ†
       * ط§ظ„ط²ط± ظ…ط§ظٹظ‚ط¹ط¯ط´ ظپظٹ ط­ط§ظ„ط© آ«ط­ط§ظˆظ„ طھط§ظ†ظٹآ» ظ…ظٹطھط© â€” آ«ظ…ط­ط§ط¶ط±ط© ط¬ط¯ظٹط¯ط©آ» ظ‡ظٹ
       * ط§ظ„ط·ط±ظٹظ‚ ط§ظ„ظˆط­ظٹط¯ ط¨ط¹ط¯ ط§ظ„ظ†ط¬ط§ط­.
       *
       * ظ…ظ„ط§ط­ط¸ط©: `transcribeUploaded` ط¨طھط±ط¬ظ‘ط¹ `true` ظˆ`phase = "done"`
       * ظپظٹ ط§ظ„ط­ط§ظ„طھظٹظ† â€” ظ„ط£ظ† **ط§ظ„طھظپط±ظٹط؛ ظ†ط¬ط­** ظپظٹ ط§ظ„ط­ط§ظ„طھظٹظ†. ط§ظ„ظپط±ظ‚ ط¨ظٹطھط±ط¬ظ…ظ‡
       * ط§ظ„ط´ط±ظٹط· ط§ظ„ظ„ظٹ طھط­طھطŒ ظ…ط´ ط­ط§ظ„ط© ط§ظ„ط´ط§ط´ط© ظƒظ„ظ‡ط§.
       */
      const info = readSaveInfo(payload);
      setSaveInfo(info);
      setUploadedPath(null);
      setUploadTicket(null);
      setTranscript(result);
      setPhase("done");
      return true;
    },
    [file],
  );

  /**
   * ط§ظ„ظ…ط³ط§ط± ط§ظ„ط¬ط¯ظٹط¯ (ط§ظ„ظ…ط±ط­ظ„ط© 2): طھط°ظƒط±ط© â†گ ط±ظپط¹ ظ…ط¨ط§ط´ط± â†گ طھظپط±ظٹط؛.
   *
   * âڑ ï¸ڈ ط§ظ„ظ…ظ„ظپ **ظ…ط´** ط¨ظٹظ…ط±ظ‘ ظپظٹ ط£ظٹ ط¬ط³ظ… ط·ظ„ط¨ ظ„ظ„ظپط§ظ†ظƒط´ظ†: ط¨ظٹظ†ط²ظ„ ظ…ظ† ط§ظ„ظ…طھطµظپط­
   * ظ„ظ„طھط®ط²ظٹظ† ط¹ظ„ظ‰ signed URLطŒ ظˆElevenLabs ط¨ظٹط³ط­ط¨ظ‡ ظ…ظ† ظ‡ظ†ط§ظƒ.
   */
  const run = useCallback(async () => {
    if (!file || working) return;

    setPhase("working");
    setError(null);
    setTranscript(null);
    setCopied(false);
    setUploadPercent(0);

    try {
      /* âڑ ï¸ڈ ط§ظ„ظ…ظ„ظپ ط¯ظ‡ ظ…ط±ظپظˆط¹ ط®ظ„ط§طµ ظ…ظ† ظ…ط­ط§ظˆظ„ط© ط³ط§ط¨ظ‚ط© (ظپط´ظ„ ط§ظ„طھظپط±ظٹط؛ ظ…ط«ظ„ط§ظ‹):
         ظ†ظƒظ…ظ‘ظ„ ظ…ظ† ط¹ظ†ط¯ ط§ظ„طھظپط±ظٹط؛ â€” ط±ظپط¹ 200 ظ…ظٹط¬ط§ طھط§ظ†ظٹ ظ…ط¹ظ†ط§ظ‡ ط¯ظ‚ط§ط¦ظ‚ ط¶ط§ظٹط¹ط©
         ط¹ظ„ظ‰ ط§ظ„ط·ط§ظ„ط¨ ظˆظ†طµظٹط¨ ظ…ظ† ط§ظ„ظپط§طھظˆط±ط©. ط§ظ„طھط°ظƒط±ط© ظ„ط§ط²ظ… طھظƒظˆظ† ظ…ظˆط¬ظˆط¯ط© ظ…ط¹
         ط§ظ„ظ…ط³ط§ط± (ط§ظ„ط§طھظ†ظٹظ† ط¨ظٹطھظ…ط³ط­ظˆط§ ظˆط¨ظٹطھط±ط¬ط¹ظˆط§ ظ…ط¹ ط¨ط¹ط¶ ط¯ط§ظٹظ…ظ‹ط§). */
      if (uploadedPath && uploadTicket) {
        await transcribeUploaded(uploadedPath, uploadTicket);
        return;
      }

      // â”€â”€ ط§ظ„ط®ط·ظˆط© ظ،: طھط°ظƒط±ط© ط§ظ„ط±ظپط¹ (JSON طµط؛ظٹط±) â”€â”€
      const ticketResponse = await fetch("/api/lecture-transcription/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const ticketPayload: unknown = await ticketResponse.json().catch(() => null);

      /* ط§ظ„طھط®ط²ظٹظ† ظ…ط´ ظ…ظ‡ظٹظ‘ط£ ظپظٹ ط§ظ„ط¨ظٹط¦ط© ط¯ظٹ (ط³ط·ط± ط§ظ„ط£ظˆط§ظ…ط± ط§ظ„ط£ظˆظ„ ط¨ظٹظƒط´ظپ ط¯ظ‡) â€”
         ظ†ط±ط¬ط¹ ظ„ظ„ظ…ط³ط§ط± ط§ظ„ظ‚ط¯ظٹظ… ط¨ط¯ظ„ ظ…ط§ ظ†ظ‚ظپظ„ ط§ظ„ط·ط§ظ„ط¨ ط¨ط±ط³ط§ظ„ط©. ط§ظ„ظ…ظ„ظپ
         ط§ظ„ظ…ظ„ظپ ط§ظ„طµط؛ظٹط± ظ„ط³ظ‡ ظ‡ظٹط´طھط؛ظ„. */
      const code = (ticketPayload as { error?: { code?: string } } | null)?.error?.code;
      if (ticketResponse.status === 503 && code === "STORAGE_NOT_CONFIGURED") {
        /* âڑ ï¸ڈ ط§ظ„ظ…ط³ط§ط± ط§ظ„ظ‚ط¯ظٹظ… ط¨ظٹظ…ط±ظ‘ ط¨ط¬ط³ظ… ط·ظ„ط¨ ط§ظ„ظپط§ظ†ظƒط´ظ† (ط­ط¯ ~4.5 ظ…ظٹط¬ط§ ط¹ظ„ظ‰
           Vercel). ظپظ„ظˆ ط§ظ„ظ…ظ„ظپ ظƒط¨ظٹط± ظˆط§ظ„ط±ظپط¹ ط§ظ„ظ…ط¨ط§ط´ط± ظ…ط´ ظ…ظپط¹ظ‘ظ„طŒ ظ…ط­ط§ظˆظ„ط© ط§ظ„ط±ظپط¹
           ظ‡طھظپط´ظ„ ط¹ظ†ط¯ ط§ظ„ظ…ظ†طµظ‘ط© ط¨ط±ط³ط§ظ„ط© ط؛ط§ظ…ط¶ط© â€” ط¨ظ†ط±ظپط¶ظ‡ط§ ظ‡ظ†ط§ ط¨ط±ط³ط§ظ„ط©
           ظ…ظپظ‡ظˆظ…ط©. ط§ظ„ظ…ظ„ظپ ط§ظ„طµط؛ظٹط± ظ„ط³ظ‡ ظ‡ظٹط´طھط؛ظ„ ط¹ط§ط¯ظٹ. */
        if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
          setFailureCode("storage.disabled");
          setError(
            failCode(
              "storage.disabled",
              `ط­ط¬ظ… ط§ظ„ظ…ظ„ظپ ظƒط¨ظٹط± ط£ظˆظٹ ظˆط§ظ„ط±ظپط¹ ط§ظ„ظ…ط¨ط§ط´ط± ظ…ط´ ظ…طھط§ط­ ط­ط§ظ„ظٹط§ظ‹. ط§ظ„ط­ط¯ ظپظٹ ط§ظ„ظˆط¶ط¹ ط¯ظ‡ ${formatFileSize(
                MAX_DIRECT_UPLOAD_BYTES,
              )}. ط¬ط±ظ‘ط¨ طھط§ظ†ظٹ ط¨ط¹ط¯ ط´ظˆظٹط©.`,
            ),
          );
          setPhase("error");
          return;
        }
        await runDirect();
        return;
      }

      if (!ticketResponse.ok) {
        setFailureCode("ticket.http");
        setError(failCode("ticket.http", extractErrorMessage(ticketPayload, ERR_UPLOAD_RETRY)));
        setPhase("error");
        return;
      }

      const ticket = ticketPayload as UploadTicket | null;
      // ًںژ« ticketId ط¥ظ„ط²ط§ظ…ظٹ â€” ظ…ظ† ط؛ظٹط±ظ‡ ط§ظ„ط®ط§ط¯ظ… ط¨ظٹط±ظپط¶ ط§ظ„طھظپط±ظٹط؛ ط£طµظ„ظ‹ط§.
      if (!ticket?.signedUrl || !ticket.token || !ticket.path || typeof ticket.ticketId !== "string") {
        setFailureCode("ticket.invalid");
        setError(failCode("ticket.invalid", ERR_UPLOAD_RETRY));
        setPhase("error");
        return;
      }

      // â”€â”€ ط§ظ„ط®ط·ظˆط© ظ¢: ط§ظ„ط±ظپط¹ ط§ظ„ظ…ط¨ط§ط´ط± ظ„ظ„طھط®ط²ظٹظ† (ط¨ظ†ط³ط¨ط© ط­ظ‚ظٹظ‚ظٹط©) â”€â”€
      setStage("uploading");
      try {
        await uploadDirect(ticket.signedUrl, ticket.token, file, setUploadPercent);
      } catch {
        setFailureCode("upload.xhr");
        setError(
          failCode(
            "upload.xhr",
            "ط§ظ„ظ…ظ„ظپ ط£ظƒط¨ط± ظ…ظ† ط§ظ„ط­ط¯ ط§ظ„ظ…ط³ظ…ظˆط­ ظ„ظ„ط±ظپط¹. ظپط¶ظ„ظ‹ط§ ط§ط¶ط؛ط· ط§ظ„ظ…ظ„ظپ ظ…ظ† ظ‡ط§طھظپظƒ ط¨ط§ط³طھط®ط¯ط§ظ… ط£ظٹ طھط·ط¨ظٹظ‚ ط¶ط؛ط· طµظˆطھ ظˆط­ط§ظˆظ„ طھط§ظ†ظٹ."
          )
        );
        setPhase("error");
        return;
      }

      // ط§ظ„ظ…ظ„ظپ ط¨ظ‚ظ‰ ظپظٹ ظ…ظƒط§ظ†ظ‡ â€” ط§ظ„ظ…ط³ط§ط± + ط§ظ„طھط°ظƒط±ط© ظ…ط¹ ط¨ط¹ط¶ ط¯ط§ظٹظ…ظ‹ط§.
      setUploadedPath(ticket.path);
      setUploadTicket({ ticketId: ticket.ticketId, secret: ticket.secret ?? null });

      // â”€â”€ ط§ظ„ط®ط·ظˆط§طھ ظ£ ظˆ ظ¤: طھظپط±ظٹط؛ + ط¹ط±ط¶ â”€â”€
      await transcribeUploaded(ticket.path, {
        ticketId: ticket.ticketId,
        secret: ticket.secret ?? null,
      });
    } catch {
      // ظپط´ظ„ fetch ظ†ظپط³ظ‡ = ظ†طھ ظپط§طµظ„ ط£ظˆ ط§ظ„طµظپط­ط© ط§طھظ‚ظپظ„طھ
      setFailureCode("net.run");
      setError(failCode("net.run", ERR_NETWORK));
      setPhase("error");
    }
  }, [file, working, runDirect, uploadedPath, uploadTicket, transcribeUploaded]);

  /** ظ†ط³ط® ط§ظ„ظ†طµ ظ„ظ„ط­ط§ظپط¸ط© â€” ظ…ط¹ طھظ†ط¸ظٹظپ ط§ظ„ظ…ط¤ظ‚ظ‘طھ ط¹ط´ط§ظ† ظ…ط§ظٹطھط³ط±ظ‘ط¨ط´ ط¨ظٹظ† Copies. */
  const copyText = useCallback(async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript.text);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("ظ…ظ‚ط¯ط±ظ†ط§ط´ ظ†ظ†ط³ط® ط§ظ„ظ†طµ. ط­ط¯ظ‘ط¯ ط§ظ„ظ†طµ ظˆط§ط¹ظ…ظ„ظ‡ ظ†ط³ط® ظٹط¯ظˆظٹ.");
    }
  }, [transcript]);

  /** طھط­ظ…ظٹظ„ ط§ظ„ظ†طµ ظƒظ…ظ„ظپ .txt. */
  const downloadText = useCallback(() => {
    if (!transcript || !file) return;
    // BOM ظپظٹ ط§ظ„ط£ظˆظ„ ط¹ط´ط§ظ† ظ†ظˆطھط¨ط§ط¯ ظٹظپطھط­ ط§ظ„ط¹ط±ط¨ظٹ طµط­ ط¹ظ„ظ‰ ظˆظٹظ†ط¯ظˆط²
    const blob = new Blob(["\uFEFF", transcript.text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = downloadFilename(file.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [transcript, file]);

  return (
    <div className="space-y-5">
      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ ظ…ظ†ط·ظ‚ط© ط§ظ„ط±ظپط¹ â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!working) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (working) return;
          selectFile(event.dataTransfer.files?.[0]);
        }}
        className={[
          "rounded-2xl border-2 border-dashed p-8 text-center transition-colors md:p-12",
          dragging
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--rule)] bg-[var(--card-primary)]",
          working ? "opacity-60" : "",
        ].join(" ")}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <FileAudio size={26} aria-hidden />
        </div>

        <p className="text-base font-bold text-[var(--text)]">
          ط§ط³ط­ط¨ ظ…ظ„ظپ ط§ظ„ظ…ط­ط§ط¶ط±ط© ظ‡ظ†ط§ ط£ظˆ ط§ط¶ط؛ط· ظ„ط§ط®طھظٹط§ط± ظ…ظ„ظپ
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {FORMATS_LABEL} â€” ط§ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ {MAX_SIZE_LABEL}
        </p>

        <button
          type="button"
          onClick={openPicker}
          disabled={working}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={18} aria-hidden />
          <span>ط§ط®طھط± ظ…ظ„ظپ</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={LECTURE_FILE_ACCEPT}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
      </div>

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ ط§ظ„ظ…ظ„ظپ ط§ظ„ظ…ط®طھط§ط± â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {file && !transcript && (
        <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <FileAudio size={20} aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]" title={originalName ?? file.name}>
                {originalName ?? file.name}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatFileSize(file.size)}
                {file.type ? ` آ· ${file.type}` : ""}
                {originalSize > 0 ? (
                  <span className="text-[var(--accent)]">
                    {` آ· طھظ… ط¶ط؛ط·ظ‡ ظ…ظ† ${formatFileSize(originalSize)}`}
                  </span>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={reset}
              disabled={working}
              className="shrink-0 rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--card-secondary)] hover:text-[var(--text)] disabled:opacity-40"
              aria-label="ط¥ط²ط§ظ„ط© ط§ظ„ظ…ظ„ظپ"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* ط£ط«ظ†ط§ط، ط§ظ„ط´ط؛ظ„: ط¯ظˆظ‘ط§ط±ط© + ط´ط±ظٹط· ظ†ط§ط¨ط¶ â€” ط§ظ„ط´ط§ط´ط© ظ…ط§طھظ…ظˆط¯ظٹط´ ط¨طھظپطھظ‘ط±
              ظˆط§ظ„ط´ط±ظٹط· ط¨ظٹظˆط¶ط­ ط¥ظ† ظپظٹ ط´ط؛ظ„ ط´ط؛ظ‘ط§ظ„ ظپط¹ظ„ط§ظ‹. */}
          {working ? (
            <div className="mt-4" role="status" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--accent)]">
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
                <span>
                  {stage === "uploading"
                    ? "ط¬ط§ط±ظٹ ط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط©..."
                    : stage === "finalizing"
                      ? "ط¬ط§ط±ظٹ طھط¬ظ‡ظٹط² ط§ظ„ظ†طµ..."
                      : "طھظ… ط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط©طŒ ط¬ط§ط±ظٹ طھط­ظˆظٹظ„ظ‡ط§ ط¥ظ„ظ‰ ظ†طµ..."}
                </span>
              </div>

              {/* âڑ ï¸ڈ ط§ظ„ط´ط±ظٹط· ط¨ظٹطھط­ط±ظƒ ط¨ظ†ط³ط¨طھظٹظ† ظ…ط®طھظ„ظپط© ط­ط³ط¨ ط§ظ„ظ…ط±ط­ظ„ط©:
                  - ط£ط«ظ†ط§ط، ط§ظ„ط±ظپط¹: ط¹ط±ط¶ ط­ظ‚ظٹظ‚ظٹ ظ…ظ† ط§ظ„ط¨ط§ظٹطھط§طھ ط§ظ„ظ…ط±ظپظˆط¹ط© (integers).
                  - ط£ط«ظ†ط§ط، ط§ظ„طھط­ظˆظٹظ„: ظ†ط¨ط¶ط© ط؛ظٹط± ظ…ط­ط¯ط¯ط©طŒ **ظ…ظ† ط؛ظٹط± ط£ظٹ ط±ظ‚ظ…** â€” ظ„ط£ظ†
                    ElevenLabs ظ…ط´ ط¨ظٹط¨ط¹طھ طھظ‚ط¯ظ‘ظ… ظˆط¹ط±ط¶ آ«60%آ» ظ‡ظ†ط§ ظƒط°ط¨.
                  ط§ظ„طھط­ظˆظٹظ„ ط§ظ„ط·ظˆظٹظ„ ط¨ظٹط­طµظ„ ط¨ط³ ظپظٹ ط§ظ„ظ…ط±ط­ظ„ط© ط¯ظٹ ظ„ط£ظ† ط§ظ„ظ…ظ„ظپ ط؛ط§ظ„ط¨ط§ظ‹
                  ط¨ظٹظƒظˆظ† ط£ظƒط¨ط± ظ…ظ† 4.5 ظ…ظٹط¬ط§. */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--card-secondary)]">
                {stage === "preparing" ? (
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                    style={{ width: `${Math.min(100, Math.max(2, preparePercent))}%` }}
                  />
                ) : stage === "uploading" ? (
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                    style={{ width: `${Math.min(100, Math.max(2, uploadPercent))}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent)]" />
                )}
              </div>

              <p className="mt-2 text-center text-xs text-[var(--muted)]">
                {stage === "preparing"
                  ? `ط¬ط§ط±ظٹ طھط¬ظ‡ظٹط² ط§ظ„ظ…ظ„ظپ â€” ${preparePercent}%`
                  : stage === "uploading"
                  ? `ط§ظ„ط±ظپط¹ ظ…ط¨ط§ط´ط± ظ„ظ„طھط®ط²ظٹظ† â€” ${uploadPercent}%`
                  : "ط§ظ„ظ…ط­ط§ط¶ط±ط§طھ ط§ظ„ط·ظˆظٹظ„ط© ظ…ظ…ظƒظ† طھط§ط®ط¯ ط¯ظ‚ط§ط¦ظ‚ â€” ط³ظٹط¨ ط§ظ„طµظپط­ط© ظ…ظپطھظˆط­ط©."}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={run}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              <Mic size={18} aria-hidden />
              {/* ط§ظ„ظ…ظ„ظپ ظ„ط³ظ‡ ظ…ط±ظپظˆط¹طں ظٹط¹ظ†ظٹ ط¯ظˆط³ظ†ط§ ط§ظ„ط£ظˆظ„ ط±ظپط¹ ظ…ظ† ط؛ظٹط± ظ…ط§ ظٹظˆطµظ„طŒ
                  ظپط§ظ„طھط³ظ…ظٹط§طھ ظ„ط§ط²ظ… طھظˆط¶ظ‘ط­ ط¥ظ†ظ†ط§ ظ…ط´ ط¨ظ†ط±ظپط¹ طھط§ظ†ظٹ. */}
              <span>{uploadedPath ? "ط­ط§ظˆظ„ طھط­ظˆظٹظ„ظ‡ط§ طھط§ظ†ظٹ" : "طھط­ظˆظٹظ„ ط¥ظ„ظ‰ ظ†طµ"}</span>
            </button>
          )}
        </div>
      )}

{/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ ط¨ط·ط§ظ‚ط© ط§ظ„ط§ط³طھط±ط¯ط§ط¯ ط¨ط¹ط¯ ط§ظ„ظپط´ظ„ â”€â”€â”€â”€â”€â”€â”€â”€â”€
          âڑ ï¸ڈ ط¨طھط¸ظ‡ط± ط¨ط³ ظ„ظ…ط§: ظپظٹ ط±ط³ط§ظ„ط© ط®ط·ط£ + ظƒظˆط¯ ظپط´ظ„ ظ…ط¹ط±ظˆظپ + ط§ظ„ظ…ط±ط­ظ„ط© طھط³طھط­ظ‚
          ط¨ط·ط§ظ‚ط© (طھط¬ظ‡ظٹط²/ط±ظپط¹ â€” ظ…ط´ طھظپط±ظٹط؛طŒ ظ„ط£ظ† ط§ظ„طھظپط±ظٹط؛ ظ„ظ‡ ط²ط±ظ‘ظ‡ آ«ط­ط§ظˆظ„ طھط­ظˆظٹظ„ظ‡ط§
          طھط§ظ†ظٹآ»). ط§ظ„ط®ظٹط§ط±ط§طھ ط¬ط§ظٹط© ظ…ظ† `recoveryOptions` ط­ط³ط¨ ط§ظ„ظ…ط±ط­ظ„ط© ظˆط¹ط¯ط¯
          ط§ظ„ظ…ط­ط§ظˆظ„ط§طھ â€” ظˆظƒظ„ ط²ط± ظپظٹظ‡ط§ ط¨ظٹظ†ظپظ‘ط° ط¥ط¬ط±ط§ط،ظ‹ ط­ظ‚ظٹظ‚ظٹظ‹ط§:
          ط¥ط¹ط§ط¯ط© ظٹط¯ظˆظٹط© / ظپطھط­ ط§ظ„ظ…ظ†طھظ‚ظٹ / طھط¹ظ„ظٹظ…ط§طھ / ط±ط§ط¨ط· `/ai-studio`. */}
      {error && failureCode && needsRecoveryCard(stageFromCode(failureCode)) && (
        <RecoveryCard
          stage={stageFromCode(failureCode)}
          attempts={prepareAttempts}
          message={error}
          working={working}
          onAction={handleRecovery}
        />
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ طھط­ط°ظٹط± ط§ظ„ظ…ظ„ظپ ط§ظ„ظƒط¨ظٹط± â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {largeFileWarning && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
          <p className="text-sm leading-relaxed text-[var(--text)]">{largeFileWarning}</p>
        </div>
      )}

      {/* شريط تقدم أثناء التفريغ */}
      {working && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--card-secondary)]">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
      )}
      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ ط§ظ„ط®ط·ط£ â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" aria-hidden />
           <div className="flex-1">
             <p className="text-sm leading-relaxed text-[var(--text)]">{error}</p>
             <a href="https://wa.me/201204556797" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">طھظˆط§طµظ„ ظ…ط¹ ط§ظ„ط¯ط¹ظ… (ظˆط§طھط³ط§ط¨)</a>
           </div>
        </div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ ط§ظ„ظ†طµ ط§ظ„ظ†ط§طھط¬ â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {transcript && (
        <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <Check size={18} aria-hidden />
              <span>طھظ… طھط­ظˆظٹظ„ ط§ظ„ظ…ط­ط§ط¶ط±ط© ط¨ظ†ط¬ط§ط­ âœ“</span>
            </p>

            {transcript.duration !== null && (
              <p className="text-xs text-[var(--muted)]">
                ظ…ط¯ط© ط§ظ„طھط³ط¬ظٹظ„: {formatDuration(transcript.duration)}
              </p>
            )}
            {transcript.provider && (
              <p className="text-xs text-[var(--muted)]">
                المزوّد: {transcript.provider} — {transcript.model}
              </p>
            )}
          </div>

          {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ ًں“ڑ ط­ط§ظ„ط© ط­ظپط¸ ط§ظ„ظ…ط­ط§ط¶ط±ط© (ط§ظ„ظ…ط±ط­ظ„ط© ظ£) â”€â”€â”€â”€â”€â”€â”€â”€â”€
           *
           * âڑ ï¸ڈ ط§ظ„ط´ط±ظٹط· ط¯ظ‡ **ظ…ط´** ط¬ط²ط، ظ…ظ† ط­ط§ظ„ط© ظ†ط¬ط§ط­/ظپط´ظ„ ط§ظ„طھظپط±ظٹط؛. ط§ظ„طھظپط±ظٹط؛
           * ظ†ط¬ط­ ظ،ظ ظ ظھ ظپظٹ ظƒظ„ ط§ظ„ط­ط§ظ„ط§طھ ط§ظ„ظ…ط¹ط±ظˆط¶ط© ظ‡ظ†ط§ â€” ط¯ظ‡ ظƒظ„ط§ظ… ط¹ظ† **ط§ظ„ط­ظپط¸
           * ظپظٹ ط§ظ„ط­ط³ط§ط¨** ط¨ط³. ط³ط¨ط¨ ط§ظ„ظپطµظ„: آ«ظ†ط¬ط­ ط§ظ„طھظپط±ظٹط؛آ» ظˆآ«ط§طھط­ظپط¸طھآ» ط­ظ‚ظٹظ‚طھظٹظ†
           * ظ…ظ†ظپطµظ„طھظٹظ†طŒ ظˆط¥ط®ظپط§ط، ط§ظ„ظپط±ظ‚ ظٹط®ظ„ظ‘ظٹ ط§ظ„ط·ط§ظ„ط¨ ظٹظپظƒظ‘ط± ط¥ظ† ط¶ط§ط¹ ظ…ظ†ظ‘ظ‡ ظ†طµ ظˆظ‡ظˆ
           * ظ„ط³ظ‡ ظ‚ط¯ط§ظ…ظ‡ ط¹ظ„ظ‰ ط§ظ„ط´ط§ط´ط©.
           */}
          {saveInfo && (
            <div
              role="status"
              className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${
                saveInfo.saved
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/30 bg-amber-500/10"
              }`}
            >
              {saveInfo.saved ? (
                <Check size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {saveInfo.saved
                    ? "ظ…ط­ظپظˆط¸ط© ظپظٹ ط­ط³ط§ط¨ظƒ âœ“"
                    : "ط§ظ„ظ†طµ ط¬ط§ظ‡ط² â€” ط¨ط³ ط§ظ„ظ…ط­ط§ط¶ط±ط© ظ…طھط­ظپط¸طھط´"}
                </p>

                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  {saveInfo.saved
                    ? "طھظ‚ط¯ط± طھط±ط¬ط¹ظ„ظ‡ط§ ظپظٹ ط£ظٹ ظˆظ‚طھ ظ…ظ† آ«ظ…ط­ط§ط¶ط±ط§طھظٹآ»."
                    : saveInfo.persistCode === "AUTH_REQUIRED"
                      ? "ط³ط¬ظ‘ظ„ ط¯ط®ظˆظ„ ط§ظ„ط£ظˆظ„طŒ ظˆط¨ط¹ط¯ظٹظ† ط§ط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط© طھط§ظ†ظٹ ظˆظ‡طھطھط­ظپط¸ ظپظٹ ط­ط³ط§ط¨ظƒ. ط§ظ„ظ†طµ ط§ظ„ظ„ظٹ ظپظˆظ‚ ظ…ظˆط¬ظˆط¯ â€” ط§ظ†ط³ط®ظ‡ ط£ظˆ ط­ظ…ظ‘ظ„ظ‡ ط¯ظ„ظˆظ‚طھظٹ."
                      : (saveInfo.persistMessage ??
                        "ط­طµظ„طھ ظ…ط´ظƒظ„ط© ظپظٹ ط§ظ„ط­ظپط¸. ط§ظ„ظ†طµ ط§ظ„ظ„ظٹ ظپظˆظ‚ ظ…ظˆط¬ظˆط¯ â€” ط§ظ†ط³ط®ظ‡ ط£ظˆ ط­ظ…ظ‘ظ„ظ‡طŒ ظˆط¬ط±ظ‘ط¨ طھط±ظپط¹ ط§ظ„ظ…ط­ط§ط¶ط±ط© طھط§ظ†ظٹ.")}
                </p>

                {/* ط±ط§ط¨ط· ظ„طµظپط­ط© ط§ظ„ظ…ط­ط§ط¶ط±ط§طھ â€” ط¨ظٹط¸ظ‡ط± ط¨ط³ ظ„ظ…ط§ ظٹظƒظˆظ† ظپظٹ ظ…ط­ط§ط¶ط±ط©
                    ظ…ط­ظپظˆط¸ط© ظپط¹ظ„ط§ظ‹ (ظٹط¹ظ†ظٹ ظپظٹ ط­ط§ط¬ط© ظٹظ„ظˆظ‘ظٹ ط¹ظ„ظٹظ‡ط§). */}
                {saveInfo.saved && (
                  <Link
                    href="/lectures"
                    className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] underline underline-offset-4"
                  >
                    ط§ظپطھط­ ظ…ط­ط§ط¶ط±ط§طھظٹ
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ط£ط²ط±ط§ط± ط§ظ„ظ†ط³ط® ظˆط§ظ„طھط­ظ…ظٹظ„ */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyText}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
            >
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              <span>{copied ? "طھظ… ط§ظ„ظ†ط³ط® âœ“" : "ظ†ط³ط® ط§ظ„ظ†طµ"}</span>
            </button>

            <button
              type="button"
              onClick={downloadText}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
            >
              <Download size={16} aria-hidden />
              <span>طھط­ظ…ظٹظ„ TXT</span>
            </button>

            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--card-secondary)] hover:text-[var(--text)]"
            >
              <RotateCcw size={16} aria-hidden />
              <span>ظ…ط­ط§ط¶ط±ط© ط¬ط¯ظٹط¯ط©</span>
            </button>
          </div>

          {/* ظ…ط±ط¨ط¹ ط§ظ„ظ†طµ.
              dir="rtl" + unicode-bidi:plaintext = ط§ظ„ط¹ط±ط¨ظٹ ط¨ظٹطھط¸ط¨ط· RTLطŒ ظˆط§ظ„ظƒظ„ظ…ط©
              ط§ظ„ط¥ظ†ط¬ظ„ظٹط²ظٹط© (آ«JavaScriptآ») ط¨طھطھظ‚ط±ظٹ LTR ظˆط¹ظ„ط§ظ…ط§طھ ط§ظ„طھط±ظ‚ظٹظ… ظ…ط§ ط¨طھظ†ط·ظ‘ط´.
              pre-wrap ط¹ط´ط§ظ† ظپظ‚ط±ط§طھ ط§ظ„ط±ط¯ طھظپط¶ظ„ ط²ظٹ ظ…ط§ ظ‡ظٹطŒ ظˆoverflow-wrap:anywhere
              ط¹ط´ط§ظ† ظƒظ„ظ…ط© ط·ظˆظٹظ„ط© ظ…ط§ طھظƒط³ظ‘ط±ط´ ط§ظ„طھط®ط·ظٹط·. */}
          <div
            dir="rtl"
            className="mt-4 max-h-[32rem] overflow-y-auto rounded-xl border border-[var(--rule)] bg-[var(--app-bg)] p-4 text-[15px] leading-[2] text-[var(--text)]"
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              unicodeBidi: "plaintext",
            }}
          >
            {transcript.text}
          </div>
        </div>
      )}

      {/* ط¥ط´ط¹ط§ط± طµط؛ظٹط± ط¨ط­ط¯ظˆط¯ ط§ظ„ط§ط³طھط®ط¯ط§ظ… â€” ط´ظپط§ظپ ط¨ط¯ظˆظ† ظ…ط§ ظٹط®ظˆظ‘ظپ */}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--muted)]">
        <Sparkles size={13} aria-hidden />
        <span>ط§ظ„ظ†طµ ط¨ظٹط·ظ„ط¹ ط²ظٹ ظ…ط§ ظ‡ظˆ â€” ط±ط§ط¬ط¹ظ‡ ظ‚ط¨ظ„ ظ…ط§ طھط¹طھظ…ط¯ ط¹ظ„ظٹظ‡ ظپظٹ ظ…ط°ط§ظƒط±طھظƒ.</span>
      </p>
    </div>
  );
}
