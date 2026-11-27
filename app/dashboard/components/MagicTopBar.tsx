"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with localStorage (external system) is intentional */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import { railAccountFromUser, type RailAccount } from "./nav-config";

const AVATAR_STORAGE_KEY = "magicly_avatar";

function AccountMenu({ account }: { account: RailAccount | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const readAvatar = () => {
      try {
        setAvatar(window.localStorage.getItem(AVATAR_STORAGE_KEY));
      } catch {}
    };
    readAvatar();
    window.addEventListener("magicly:avatar-changed", readAvatar);
    window.addEventListener("storage", readAvatar);
    return () => {
      window.removeEventListener("magicly:avatar-changed", readAvatar);
      window.removeEventListener("storage", readAvatar);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!account) {
    return (
      <Link href="/login" className="btn btn-marker px-3 py-1.5 text-xs shrink-0">
        تسجيل الدخول
      </Link>
    );
  }

  const isImage = avatar && avatar.startsWith("data:image");

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    await createClient().auth.signOut();
    router.push("/welcome");
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="قائمة الحساب"
        className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-rule bg-paper-2 transition hover:bg-paper-3"
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL من جهاز المستخدم
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : avatar ? (
          <span aria-hidden className="text-lg leading-none">{avatar}</span>
        ) : account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- صورة الحساب من مزوّد تسجيل الدخول
          <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="font-display text-sm font-extrabold text-ink">
            {account.avatarInitial}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="الحساب"
          className="absolute end-0 top-[calc(100%+0.5rem)] z-50 w-56 space-y-1 rounded-[var(--r-md)] border border-rule bg-paper p-2 shadow-lg"
        >
          <div className="border-b border-rule px-2 pb-2 pt-1">
            <p className="truncate text-xs font-bold text-ink">{account.displayName}</p>
            <p className="mono truncate text-[11px] normal-case text-ink-soft">{account.displayEmail}</p>
          </div>
          {account.isGuest && (
            <p className="px-2 pb-1 text-[11px] leading-relaxed text-ink-soft">
              إنت داخل بحساب زائر — سجّل بإيميل عشان متضيعش بياناتك.
            </p>
          )}
          <Link
            role="menuitem"
            href="/dashboard/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-2 text-sm text-ink transition hover:bg-paper-3"
          >
            <UserRound size={16} aria-hidden />
            الملف الشخصي
          </Link>
          <Link
            role="menuitem"
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-2 text-sm text-ink transition hover:bg-paper-3"
          >
            <Settings size={16} aria-hidden />
            إعدادات الحساب
          </Link>
          {account.isGuest ? (
            <Link
              role="menuitem"
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-2 text-sm font-semibold text-ink transition hover:bg-paper-3"
            >
              <UserPlus size={16} aria-hidden />
              سجّل حساب دائم
            </Link>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-2 text-sm text-red-600 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              <LogOut size={16} aria-hidden />
              {signingOut ? "بيخرّج…" : "تسجيل الخروج"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function MagicTopBar() {
  const [account, setAccount] = useState<RailAccount | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        setAccount(railAccountFromUser(data.user));
      } catch {
        setAccount(null);
      }
    })();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-rule bg-paper/90 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link
          href="/dashboard"
          aria-label="Magiclly — لوحة التحكم"
          className="flex min-w-0 items-center gap-2"
        >
          <span
            aria-hidden
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-marker font-display text-base font-extrabold text-onmarker"
          >
            M
            <svg
              viewBox="0 0 24 24"
              className="absolute -top-1 -end-1 h-3.5 w-3.5 text-amber-400 drop-shadow-sm"
              fill="currentColor"
            >
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
            </svg>
          </span>
          <span className="truncate text-sm font-bold text-ink">
            <span className="text-marker">Magiclly</span>
            <span className="hidden font-normal text-ink-soft sm:inline"> — مساحة الدراسة</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NotificationBell />
          <AccountMenu account={account} />
        </div>
      </div>
    </header>
  );
}
