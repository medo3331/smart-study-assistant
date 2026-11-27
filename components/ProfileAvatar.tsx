"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Syncing with localStorage (external system) is intentional */

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const STORAGE_KEY = "magicly_avatar";

const READY_AVATARS = ["🦊", "🐼", "🐯", "🦉", "🐙", "🦄", "🐲", "🤖"];

interface ProfileAvatarProps {
  initial: string;
  name: string;
  size?: number;
  /** صورة الحساب من مزوّد تسجيل الدخول — احتياط لو مفيش تخصيص محلي. */
  accountUrl?: string | null;
}

export function ProfileAvatar({ initial, name, size = 48, accountUrl }: ProfileAvatarProps) {
  const [avatar, setAvatar] = useState<string | null>(null); // emoji or data URL
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setAvatar(saved);
    } catch {}
  }, []);

  const persist = (val: string | null) => {
    setAvatar(val);
    try {
      if (val) window.localStorage.setItem(STORAGE_KEY, val);
      else window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event("magicly:avatar-changed"));
    } catch {}
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("يرجى اختيار ملف صورة.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("حجم الصورة يجب أن لا يتجاوز 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") persist(reader.result);
    };
    reader.readAsDataURL(file);
    setOpen(false);
  };

  const isImage = avatar && avatar.startsWith("data:image");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="تخصيص صورة الملف الشخصي"
        className="relative rounded-full overflow-hidden border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar!} alt={name} className="h-full w-full object-cover" />
        ) : avatar ? (
          <span className="text-2xl leading-none">{avatar}</span>
        ) : accountUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- صورة الحساب من مزوّد تسجيل الدخول
          <img src={accountUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-bold text-[var(--color-text-primary)]">
            {initial}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="تخصيص صورة الملف الشخصي">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            اختر Avatar جاهز أو ارفع صورة من جهازك.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {READY_AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => persist(a)}
                className={`h-12 rounded-[var(--r-md)] border text-2xl flex items-center justify-center transition ${
                  avatar === a
                    ? "border-[var(--color-primary)] bg-[var(--color-surface-2)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-1)]"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              رفع صورة
            </Button>
            <Button variant="ghost" onClick={() => persist(null)}>
              العودة للافتراضي
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            ملاحظة: حفظ الصورة محليًا في هذا الإصدار. التكامل مع Supabase Storage يتطلب إعداد bucket وسياسات RLS (تقرير منفصل).
          </p>
        </div>
      </Modal>
    </>
  );
}