"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, LoadingSheets, DataNotice, usePenTheme } from "../components/PageShell";
import { useAuthUser } from "../components/use-page-data";
import { THEME_STYLES } from "../components/theme-helpers";
import { fetchAchievedSkills, addSkill, removeSkill } from "@/lib/pages-data";
import { isField, type FieldId } from "@/lib/user-persona";
import {
  achievedInTrack,
  nextSkillInTrack,
  trackSkillCount,
  tracksForField,
  type CareerSkill,
  type CareerStage,
  type CareerTrack,
} from "./tracks";

/* ==========================================================================
   المسار المهني — إنت فين من الدور

   الصفحة سؤال واحد متكرر: «تعرف تعمل الحاجة دي؟» تعلّم، والشريط بيتحرّك.

   ليه المستخدم هو اللي بيعلّم مش النظام؟ لأن مافيش امتحان بيقيس «تعرف
   React». اللي عنده سنتين شغل مش محتاج يخلّص تراك عشان يعلّم عليها، واللي
   خلّص تراك ممكن يكون لسه مش واثق. التقييم الذاتي أصدق هنا، وده كمان
   بيخلّي الصفحة تنفع للي جاي من بره المنصة.

   قايمة المهارات في `tracks.ts` — في الكود مش في الداتابيز. الداتابيز
   بتحفظ حاجة واحدة: إيه اللي علّمت عليه.

   ⚠️ محتاج جدول career_skills — db/pages.sql (سطر ١٠٩).
   ========================================================================== */

/** أرقام هندية — عشان ما تتخلطش مع العربي حواليها. */
function arNum(n: number): string {
  return n.toLocaleString("ar-EG");
}

function percentOf(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((current / total) * 100);
}

/* --------------------------------------------------------------------------
   الكومبوننتس

   ⚠️ كلها في جذر الملف مش جوه CareerPage. لو اتعرّفت جوه، React يشوفها نوع
   جديد كل رندر فبيهدّ الـ ٩٠ صف ويبنيهم من الأول مع كل ضغطة.
   -------------------------------------------------------------------------- */

/** كرت مسار — بيختار وبيوري التقدّم في نفس الوقت. */
function TrackCard({
  track,
  achievedCount,
  isActive,
  accentBg,
  accentText,
  ring,
  onSelect,
}: {
  track: CareerTrack;
  achievedCount: number;
  isActive: boolean;
  accentBg: string;
  accentText: string;
  ring: string;
  onSelect: (id: string) => void;
}) {
  const total = trackSkillCount(track);
  const percent = percentOf(achievedCount, total);

  return (
    <button
      onClick={() => onSelect(track.id)}
      aria-pressed={isActive}
      aria-label={`${track.label} — ${track.role}، ${arNum(achievedCount)} من ${arNum(total)} مهارة`}
      className={`sheet-card p-4 text-start space-y-2 transition ${isActive ? `ring-2 ${ring}` : "hover:border-ink-soft"}`}
    >
      {/* spans مش divs/ps: المحتوى الجاري (flow content) ممنوع جوه button
          في الـ HTML. المتصفحات بتتسامح بس بعض أدوات المساعدة بتتلخبط. */}
      <span className="flex items-center gap-2">
        <span className="text-lg leading-none shrink-0" aria-hidden>
          {track.emoji}
        </span>
        <span className="block min-w-0">
          <span className="block font-display font-extrabold text-xs text-ink leading-tight">{track.label}</span>
          <span className="block text-[10px] text-ink-soft truncate">{track.role}</span>
        </span>
      </span>

      <span className="block space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`mono text-[10px] ltr-num ${percent > 0 ? accentText : "text-ink-soft"}`}>
            {arNum(achievedCount)}/{arNum(total)}
          </span>
          <span className="mono text-[10px] text-ink-soft ltr-num">{arNum(percent)}%</span>
        </span>
        <span className="meter meter-sm block">
          <span className={`meter-fill block ${accentBg}`} style={{ width: `${percent}%` }} />
        </span>
      </span>
    </button>
  );
}

/** صف مهارة — التوجيل نفسه. */
function SkillRow({
  skill,
  isAchieved,
  isPending,
  accentBg,
  onToggle,
}: {
  skill: CareerSkill;
  isAchieved: boolean;
  /** فيه طلب طاير للمهارة دي — الزرار مقفول لحد ما يرجع */
  isPending: boolean;
  accentBg: string;
  onToggle: (skill: CareerSkill) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-rule last:border-b-0">
      {/* الاسم ثابت و aria-pressed هو اللي بيشيل الحالة — لو الاتنين
          بيتغيّروا، قارئ الشاشة بينطق الحالة مرتين.

          ⚠️ aria-disabled مش disabled عن قصد. العنصر المعطّل بـ `disabled`
          مش بيقدر يشيل الفوكس، فالمستخدم اللي بيمشي بالكيبورد بيخسر مكانه
          كل مرة يعلّم على مهارة — ويرجع يعمل Tab من أول الصفحة في ليستة
          فيها ٦٧ صف. القفل الحقيقي في handleToggle (بيرجع فوراً لو فيه طلب
          طاير)، فالتعطيل هنا كان للشكل بس. */}
      <button
        onClick={() => onToggle(skill)}
        aria-disabled={isPending}
        aria-pressed={isAchieved}
        aria-label={`أعرفها: ${skill.label}`}
        className={`mt-0.5 w-[18px] h-[18px] shrink-0 rounded-[5px] border transition flex items-center justify-center ${
          isPending ? "opacity-50" : ""
        } ${isAchieved ? `${accentBg} border-transparent text-paper` : "border-rule-strong hover:border-ink-soft"}`}
      >
        {isAchieved && (
          <span className="text-[11px] leading-none" aria-hidden>
            ✓
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-xs font-bold leading-relaxed ${isAchieved ? "text-ink" : "text-ink-soft"}`}>
          {skill.label}
        </p>
        <p className="text-[11px] text-ink-soft leading-relaxed mt-0.5">{skill.hint}</p>
      </div>
    </div>
  );
}

/** مرحلة — عنوانها وعدّادها وصفوفها. */
function StageBlock({
  stage,
  achieved,
  pendingIds,
  accentBg,
  accentText,
  onToggle,
}: {
  stage: CareerStage;
  achieved: Set<string>;
  pendingIds: Set<string>;
  accentBg: string;
  accentText: string;
  onToggle: (skill: CareerSkill) => void;
}) {
  const done = stage.skills.reduce((sum, skill) => sum + (achieved.has(skill.id) ? 1 : 0), 0);
  const isComplete = done === stage.skills.length;

  return (
    <div className="sheet-card p-5 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        {/* h3 مش p: من غير عناوين حقيقية، اللي بيتنقّل بالعناوين مش بيوصل
            لأي مرحلة — الصفحة كلها بتبقى عنوان واحد و٦٧ صف. */}
        <h3 className={`eyebrow eyebrow-flush ${isComplete ? accentText : ""}`}>
          {stage.title}
          {isComplete && <span className="sr-only"> — كاملة</span>}
        </h3>
        <span className="mono text-ink-soft ltr-num">
          <span aria-hidden>
            {arNum(done)}/{arNum(stage.skills.length)}
          </span>
          {/* «٣/٧» لوحدها مش معلومة لقارئ الشاشة */}
          <span className="sr-only">
            {arNum(done)} من {arNum(stage.skills.length)} مهارة
          </span>
        </span>
      </div>
      <p className="text-[11px] text-ink-soft leading-relaxed mb-1">{stage.blurb}</p>

      <div>
        {stage.skills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            isAchieved={achieved.has(skill.id)}
            isPending={pendingIds.has(skill.id)}
            accentBg={accentBg}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function CareerPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const themeStyles = THEME_STYLES[usePenTheme()];

  const [achieved, setAchieved] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  /* ---- التحميل فشل؟ ----
     ⚠️ علم منفصل عن `notice` عن قصد. من غيره الصفحة بترسم واجهة النجاح على
     داتا فاضية: «٠/٦٧» و«الجّاية: HTML» وكل الخانات فاضية — يعني بتقول
     للي علّم على ٤٠ مهارة إنه لسه ما بدأش. ده كلام غلط عن بيانات المستخدم
     نفسه، مش مجرد نقص في العرض. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /* ---- الوصول لرسالة الخطأ ----
     الرسالة بتترسم فوق الصفحة، والصفحة طولها آلاف البكسلات (٦٧ صف). فلو
     مهارة في «المستوى المتقدّم» فشلت، المستخدم يشوف الخانة رجعت لوحدها
     والسبب مكتوب في مكان مش شايفه. `role="alert"` بيغطّي قارئ الشاشة بس. */
  const noticeRef = useRef<HTMLDivElement | null>(null);

  const revealNotice = () => {
    noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /* ---- المسار المفتوح ----
     مش محفوظ في الحساب عن قصد: ده فلتر عرض مش اختيار، والصفحة بتفتح على
     المسار اللي فيه أكتر تقدّم لوحدها. زر واحد يرجّعك لأي مسار تاني.

     الـ ref بيمنع الاختيار التلقائي إنه يرجّع المستخدم لمسار تاني لو الـ
     effect اشتغل تاني بعد ما اختار بإيده. */
  const [trackId, setTrackId] = useState<string>("");
  const hasPickedRef = useRef(false);

  /* ---- 🌍 مجال المستخدم ----
     بيتقرا من `profiles.field` وبيفلتر المسارات المعروضة. null معناه
     «لسه مش عارفين» — وساعتها بنعرض كل المسارات بدل ما نخمّن ونغلط.
     مستخدم قديم اتسجّل قبل ما العمود يتضاف بيقع على الحالة دي. */
  const [field, setField] = useState<FieldId | null>(null);

  const visibleTracks = useMemo(() => tracksForField(field), [field]);

  /* ---- المهارات اللي ليها طلب طاير ----
     قفل لكل مهارة مش خانة واحدة للصفحة. من غيره ضغطتين سريعتين على نفس
     الصف بيبعتوا طلبين مافيش ضمان لترتيب وصولهم → الشاشة تقول «أعرفها»
     والداتابيز تقول لأ، **من غير أي خطأ يظهر**.

     الـ ref هو مصدر الحقيقة وقت الضغطة (الـ state ممكن تكون لسه ما
     اترسمتش)، والـ state عشان الزرار يترسم مقفول. */
  const pendingRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const markPending = (id: string, on: boolean) => {
    if (on) pendingRef.current.add(id);
    else pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  };

  /* ---- تحميل المهارات المتحقّقة ---- */
  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      router.push("/dashboard");
      return;
    }
    if (session.status === "error") {
      setNotice(session.message);
                  setLoadFailed(true);
      setIsLoading(false);
      return;
    }

    const userId = session.user.id;

    // ⚠️ try/catch/finally مش زيادة: لو النداء رمى بدل ما يرجّع error،
    // `setIsLoading(false)` مش بيتنفّذ والصفحة تقعد على السكيلتون للأبد
    // من غير أي رسالة ولا طريقة تراجع.
    (async () => {
      try {
        // المجال بيتقرا مع المهارات في نفس الدورة. فشله مش سبب نوقف
        // الصفحة: من غيره بنعرض كل المسارات، وده أسوأ حاجة ممكن تحصل.
        const [{ data, error }, profileResult] = await Promise.all([
          fetchAchievedSkills(supabase, userId),
          supabase.from("profiles").select("field").eq("id", userId).maybeSingle(),
        ]);

        const loadedField = isField(profileResult.data?.field) ? profileResult.data.field : null;
        setField(loadedField);

        if (error) {
          setNotice(error.message);
          setLoadFailed(true);
          return;
        }

        const set = new Set(data);
        setAchieved(set);
        setLoadFailed(false);
        setNotice(null);

        // نفتح على المسار اللي فيه أكتر تقدّم — أقرب حاجة لـ «كمّل من هنا».
        // التعادل بيروح للأول في الليستة: الشرط `>` بس، فالمسار اللي بعده
        // بنفس الرقم مش بياخد المكان.
        //
        // ⚠️ البحث في مسارات المجال بس. لو دوّرنا في الكل، مستخدم مجاله
        // تصميم وعنده مهارة برمجة قديمة كان هيتفتح له مسار مش هيشوفه أصلاً
        // في الليستة — فيقع على شاشة مالهاش كروت.
        //
        // الـ ref هنا بيحمي من إعادة تشغيل الـ effect (تغيّر الجلسة مثلاً)
        // إنها ترجّع المستخدم لمسار تاني بعد ما اختار بإيده. الكروت نفسها
        // مش موجودة على الشاشة قبل ما التحميل يخلص، فمافيش سباق مع أول ضغطة.
        if (!hasPickedRef.current) {
          const pool = tracksForField(loadedField);
          let best = pool[0];
          let bestCount = achievedInTrack(best, set);
          for (const track of pool.slice(1)) {
            const count = achievedInTrack(track, set);
            if (count > bestCount) {
              best = track;
              bestCount = count;
            }
          }
          setTrackId(best.id);
        }
      } catch (err) {
        console.error("fetchAchievedSkills threw:", err);
        setNotice("ما قدرناش نحمّل مهاراتك. اتأكد من النت وحاول تاني.");
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [session, supabase, router, reloadKey]);

  /* ---- التوجيل ----
     بنقلب الشاشة الأول وبنرجّعها لو الشبكة رفضت. القفل بيضمن إن مافيش طلب
     تاني لنفس المهارة، فقراية الحالة من الـ closure هنا آمنة. */
  const handleToggle = async (skill: CareerSkill) => {
    if (session.status !== "ready") return;
    if (pendingRef.current.has(skill.id)) return;

    const wasAchieved = achieved.has(skill.id);

    /** بنعدّل بالشكل الدالي عشان مهارتين شغّالين مع بعض ما يمسحوش بعض. */
    const apply = (on: boolean) =>
      setAchieved((prev) => {
        const next = new Set(prev);
        if (on) next.add(skill.id);
        else next.delete(skill.id);
        return next;
      });

    markPending(skill.id, true);
    apply(!wasAchieved);

    // ⚠️ finally مش زيادة: لو الطلب رمى (الشبكة قاطعة) بدل ما يرجّع error،
    // من غيرها القفل بيفضل شغال والزرار يقعد مقفول للأبد.
    try {
      const { error } = wasAchieved
        ? await removeSkill(supabase, session.user.id, skill.id)
        : await addSkill(supabase, session.user.id, skill.id);

      if (error) {
        apply(wasAchieved);
        setNotice(error.message);
        revealNotice();
        return;
      }
      setNotice(null);
    } catch (err) {
      console.error("career toggle threw:", err);
      apply(wasAchieved);
      setNotice("ما قدرناش نحفظ التغيير. اتأكد من النت وحاول تاني.");
      revealNotice();
    } finally {
      markPending(skill.id, false);
    }
  };

  const handleSelectTrack = (id: string) => {
    hasPickedRef.current = true;
    setTrackId(id);
  };

  /** إعادة المحاولة بترجّع الصفحة لحالة التحميل — من غير كده المستخدم بيدوس
      ومايشوفش أي رد فعل لحد ما الطلب يرجع. */
  const handleRetry = () => {
    setIsLoading(true);
    setLoadFailed(false);
    setNotice(null);
    setReloadKey((k) => k + 1);
  };

  /* ---- الأرقام ----
     الحساب جوه الـ memo مش بره: `achieved` بتتغيّر مع كل توجيل، والعدّ
     بيلفّ على كل المهارات في المسارات المعروضة.

     ⚠️ العدّ على `visibleTracks` مش على كل المسارات. الإجمالي لازم يبقى
     من نفس العالم اللي المستخدم بيشوفه، وإلا الشريط يقول «٥ من ٩٤» وهو
     شايف ١٦ مهارة بس قدامه. */
  const { activeTrack, activeCount, counts, totalAchieved, nextUp } = useMemo(() => {
    const track = visibleTracks.find((t) => t.id === trackId) ?? visibleTracks[0];
    const perTrack = new Map(visibleTracks.map((t) => [t.id, achievedInTrack(t, achieved)]));

    // بنعدّ من الليستة مش من حجم الـ Set: الداتابيز ممكن يكون فيها صف
    // لمهارة اتشالت من tracks.ts، وعدّها كان هيطلّع رقم أكبر من المقام.
    let total = 0;
    for (const count of perTrack.values()) total += count;

    return {
      activeTrack: track,
      activeCount: perTrack.get(track.id) ?? 0,
      counts: perTrack,
      totalAchieved: total,
      nextUp: nextSkillInTrack(track, achieved),
    };
  }, [trackId, achieved, visibleTracks]);

  /** مقام الشريط الكلي — مهارات المسارات المعروضة بس، لنفس السبب فوق. */
  const visibleSkillCount = useMemo(
    () => visibleTracks.reduce((sum, track) => sum + trackSkillCount(track), 0),
    [visibleTracks]
  );

  const activeTotal = trackSkillCount(activeTrack);
  const activePercent = percentOf(activeCount, activeTotal);
  const overallPercent = percentOf(totalAchieved, visibleSkillCount);

  /* ---------------------------------------------------------------------- */

  return (
    <PageShell
      eyebrow="المسار المهني"
      title="إنت فين"
      lede="علّم على اللي تعرف تعمله — إنت اللي بتحكم، مش النظام. مافيش امتحان بيقيس «تعرف React»، واللي عنده شغل مش محتاج يخلّص تراك عشان يعلّم عليها."
      feedbackPage="career"
      feedbackLabel="المسار المهني"
    >
      <div ref={noticeRef}>{notice && <DataNotice message={notice} />}</div>

      {isLoading ? (
        <LoadingSheets count={3} />
      ) : loadFailed ? (
        /* الرسالة فوق بتقول إيه اللي حصل. مش بنرسم الأرقام هنا خالص —
           «٠/٦٧» على تحميل فاشل كذب على المستخدم في بياناته هو. */
        <div className="sheet-card p-8 text-center space-y-3">
          <p className="text-3xl leading-none" aria-hidden>
            📡
          </p>
          <p className="font-display font-extrabold text-base text-ink">ما وصلناش لمهاراتك</p>
          <p className="text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">
            مش بنعرض أرقام دلوقتي عشان ما نوريكش تقدّم غلط. جرّب تاني.
          </p>
          <button onClick={handleRetry} className="btn btn-marker text-sm">
            حاول تاني
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ---- الحصيلة الكلية ---- */}
          <div className="sheet-card sheet-card-live p-5 space-y-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                {/* h2 مش p: أقسام الصفحة لازم تكون عناوين حقيقية عشان اللي
                    بيتنقّل بالعناوين يوصل لها. */}
                <h2 className="eyebrow eyebrow-flush mb-2">إجمالي المهارات</h2>
                <p className="font-display font-extrabold text-3xl leading-none text-ink ltr-num">
                  <span aria-hidden>
                    {arNum(totalAchieved)}
                    <span className="text-ink-soft text-lg">/{arNum(visibleSkillCount)}</span>
                  </span>
                  <span className="sr-only">
                    {arNum(totalAchieved)} من {arNum(visibleSkillCount)} مهارة
                  </span>
                </p>
              </div>
              <p className="tag">
                <span className="ltr-num">{arNum(overallPercent)}%</span>
                <span>من كل المسارات</span>
              </p>
            </div>
            <div className="meter">
              <div className={`meter-fill ${themeStyles.accentBg}`} style={{ width: `${overallPercent}%` }} />
            </div>
          </div>

          {/* ---- المسارات: اختيار وتقدّم في نفس الوقت ---- */}
          <div className="space-y-3">
            <h2 className="eyebrow eyebrow-flush">المسارات</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {visibleTracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  achievedCount={counts.get(track.id) ?? 0}
                  isActive={track.id === activeTrack.id}
                  accentBg={themeStyles.accentBg}
                  accentText={themeStyles.accentText}
                  ring={themeStyles.ring}
                  onSelect={handleSelectTrack}
                />
              ))}
            </div>
          </div>

          {/* ---- المسار المفتوح ---- */}
          <div className="space-y-3">
            <div className="sheet-card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none shrink-0" aria-hidden>
                  {activeTrack.emoji}
                </span>
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-base text-ink leading-tight">
                    {activeTrack.label}
                  </h2>
                  <p className={`text-[11px] ${themeStyles.accentText} mt-0.5`}>{activeTrack.role}</p>
                </div>
                <span className="mono text-ink-soft ltr-num ms-auto shrink-0">
                  <span aria-hidden>
                    {arNum(activeCount)}/{arNum(activeTotal)}
                  </span>
                  <span className="sr-only">
                    {arNum(activeCount)} من {arNum(activeTotal)} مهارة
                  </span>
                </span>
              </div>

              <p className="text-xs text-ink-soft leading-relaxed">{activeTrack.blurb}</p>

              <div className="meter">
                <div className={`meter-fill ${themeStyles.accentBg}`} style={{ width: `${activePercent}%` }} />
              </div>

              {/* «الحاجة الجّاية» — أول مهارة مش متحقّقة بالترتيب. الترتيب
                  مش قانون، بس بيجاوب «أبدأ منين». */}
              {nextUp ? (
                <p className="tag">
                  <span>الجّاية</span>
                  <span className="text-ink">{nextUp.skill.label}</span>
                  <span>{nextUp.stage.title}</span>
                </p>
              ) : (
                <p className="tag">
                  <span aria-hidden>🎉</span>
                  <span>خلّصت المسار كله</span>
                </p>
              )}
            </div>

            {activeTrack.stages.map((stage) => (
              <StageBlock
                key={stage.id}
                stage={stage}
                achieved={achieved}
                pendingIds={pendingIds}
                accentBg={themeStyles.accentBg}
                accentText={themeStyles.accentText}
                onToggle={handleToggle}
              />
            ))}
          </div>

          {/* ---- الوصلة للمخطط ----
              المهارة اللي جّاية محتاجة وقت، والوقت بيتحدّد في المخطط.
              مش بنعمل هدف من هنا عن قصد — المستخدم هو اللي يكتب نيّته. */}
          <div className="sheet-card p-5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-ink-soft leading-relaxed min-w-0">
              حابب تخلّص مهارة قبل تاريخ معيّن؟ اكتبها هدف في المخطط.
            </p>
            <button
              onClick={() => router.push("/dashboard/planner")}
              className="btn btn-quiet text-sm shrink-0"
            >
              المخطط
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}