// ===========================================================================
// MAGICLY — Social Profile Page /u/[code] (MAG-XXX-XXXX)
// ===========================================================================
// صفحة الطالب الاجتماعية في مجتمع Magicly — بياناتها بتيجي من
// get_social_profile_by_code (security definer) اللي بيطبق الخصوصية:
//   - الحساب الخاص أو المعلومات المخبّية → هوية مختصرة فقط (اسم + كود + صورة)
//   - المحظور (بأي اتجاه) → الصفحة مش موجودة أصلًا
// + بطاقة QR للرابط العام (من المرحلة السابقة — نفس البيانات المعروضة).
// ===========================================================================

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import ProfileActions from "@/components/community/ProfileActions";
import UserPosts from "@/components/community/UserPosts";
import type { RelationState } from "@/lib/community/types";

type SocialProfileData = {
  found: boolean;
  user_id?: string;
  public_user_code?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string | null;
  university?: string | null;
  faculty?: string | null;
  major?: string | null;
  year?: string | null;
  interests?: string[] | null;
  account_privacy?: "public" | "private";
  allow_messages?: boolean;
  allow_friend_requests?: boolean;
  is_self?: boolean;
  relation?: { state: RelationState; request_id?: string };
};

export default async function UserPublicPage({ params }: { params: Promise<{ code?: string }> }) {
  const sp = await params;
  let code = sp?.code || "";

  // 1) لو الرابط جاي بالـUUID (روابط قديمة أو fallback) — نجيب كود MAG الكانوني
  //    ونرديركت له، بدل ما الصفحة ترمّي «كود غير صالح» على الرئيسية.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
    const boot = await createClient();
    const { data: { user: bootUser } } = await boot.auth.getUser();
    if (!bootUser) {
      redirect("/login?next=" + encodeURIComponent(`/u/${code}`));
    }
    const { data: row } = await boot
      .from("profiles")
      .select("public_user_code")
      .eq("id", code)
      .maybeSingle();
    const canonical = row?.public_user_code as string | null;
    if (canonical && /^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/i.test(canonical)) {
      redirect(`/u/${canonical}`);
    }
    redirect("/community?error=الحساب_مش_متاح");
  }

  // نفس تحقق النسخة السابقة — الصيغة الكانونية الوحيدة (db/epic6-user-code.sql)
  if (!/^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/i.test(code)) {
    redirect("/?error=كود_غير_صالح");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/u/" + encodeURIComponent(code));
  }

  const { data, error } = await supabase.rpc("get_social_profile_by_code", { p_code: code });
  if (error || !data || !(data as SocialProfileData).found) {
    // مش موجود أو محظور — نفس السلوك: لا نكشف السبب
    redirect("/community?error=الحساب_مش_متاح");
  }

  const profile = data as SocialProfileData;
  const relation = profile.relation ?? { state: "none" as RelationState };
  const isPrivate = profile.account_privacy === "private";
  const isFriend = relation.state === "friends";
  const showAcademic = !isPrivate || isFriend;

  // QR للرابط العام — نفس معلومة الصفحة المعروضة (من المرحلة السابقة)
  const { SITE_URL } = await import("@/lib/seo");
  const profileUrl = `${SITE_URL}/u/${profile.public_user_code}`;
  const qrSvg = await QRCode.toString(profileUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 160 });
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

  const infoRow = (label: string, value?: string | null) =>
    value ? (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-soft">{label}:</span>
        <span className="font-medium text-ink">{value}</span>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-paper text-ink" dir="rtl">
      {/* الغلاف */}
      <div
        className="h-40 w-full bg-gradient-to-l from-marker/30 via-paper-2 to-paper-3 border-b border-rule"
        style={profile.cover_url ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      />

      <div className="mx-auto max-w-3xl px-4">
        {/* الهوية */}
        <div className="-mt-10 flex items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-paper bg-paper-3 shadow-md">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt={profile.display_name ?? "الطالب"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-ink-soft">
                  {(profile.display_name ?? "؟").slice(0, 1)}
                </div>
              )}
            </div>
            <div className="pb-1">
              <h1 className="text-xl font-extrabold">{profile.display_name ?? "طالب Magicly"}</h1>
              <p className="mono text-xs text-ink-soft" dir="ltr">{profile.public_user_code}</p>
            </div>
          </div>
          {isPrivate && (
            <span className="mb-1 rounded-full border border-rule bg-paper-2 px-3 py-1 text-xs text-ink-soft">
              🔒 حساب خاص
            </span>
          )}
        </div>

        {/* الأزرار */}
        <div className="mt-4 border-y border-rule py-4">
          <ProfileActions
            targetUserId={profile.user_id!}
            initialState={relation.state}
            initialRequestId={relation.request_id ?? null}
            canMessage={profile.allow_messages !== false}
            canFriendRequest={profile.allow_friend_requests !== false}
          />
        </div>

        {/* منشوراته — بتظهر حسب الخصوصية والعلاقة (فاضية للسير لو ممنوع) */}
        <UserPosts userId={profile.user_id!} />

        <div className="grid gap-6 py-6 md:grid-cols-[1fr_200px]">
          <div className="space-y-5">
            {profile.bio && <p className="leading-relaxed text-ink">{profile.bio}</p>}

            {/* المعلومات الأكاديمية — مخفية تلقائيًا للخصوصية */}
            {showAcademic && (
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-ink-soft">المعلومات الأكاديمية</h2>
                <div className="space-y-1 rounded-xl border border-rule bg-paper-2/50 p-4">
                  {infoRow("الجامعة", profile.university)}
                  {infoRow("الكلية", profile.faculty)}
                  {infoRow("التخصص", profile.major)}
                  {infoRow("السنة", profile.year)}
                  {!profile.university && !profile.faculty && !profile.major && (
                    <p className="text-sm text-ink-soft">مفيش معلومات أكاديمية معروضة.</p>
                  )}
                </div>
              </section>
            )}

            {showAcademic && profile.interests && profile.interests.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-ink-soft">الاهتمامات</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((tag) => (
                    <span key={tag} className="rounded-full bg-marker/10 px-3 py-1 text-xs font-medium text-marker">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* بطاقة QR — نفس ميزة المرحلة السابقة */}
          <aside className="space-y-3 rounded-xl border border-rule bg-paper-2/50 p-4 text-center">
            <p className="text-xs font-bold text-ink-soft">كودك أو كود صاحبك</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUri} alt={`QR — ${profile.public_user_code}`} className="mx-auto h-40 w-40" />
            <p className="mono break-all text-[11px] text-ink-soft" dir="ltr">{profileUrl}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
