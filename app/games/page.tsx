"use client";

import Link from "next/link";
import { PageShell } from "@/app/dashboard/components/PageShell";

/**
 * Magicly Arcade 🕹️ — مركز الألعاب.
 *
 * الألعاب الحقيقية كلها بتكافئ من `claim_break_game` (سيرفر-أوثوريتيتيف،
 * سقف ٢ مكافآت/يوم، وبتشتغل بس بعد نشاط دراسي حقيقي) — فالصفحة هنا مجرد
 * Hub للتجميع، والمكافآت نفسها جوا كل لعبة. الكروت "قريب" بتوسّط خطة
 * الألعاب الجاية (Battle Pass، Game Items، مواسم) من غير وعود مزيفة.
 */

type ArcadeCard = {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  live: boolean;
};

const GAMES: ArcadeCard[] = [
  { href: "/break#penalty", emoji: "⚽", title: "جول ولا لا؟", desc: "ركلات ترجيح — هاتريك ٣ جول = مكافأة", live: true },
  { href: "/break", emoji: "🧠", title: "Memory Match", desc: "مطابقة مصطلحات مولّدة من مادتك بالـ AI", live: true },
  { href: "/break", emoji: "⚡", title: "Reaction Test", desc: "سرعة بديهة — كل ما تسرع تكسب أسرع", live: true },
  { href: "/break", emoji: "🏃", title: "Quiz Rush", desc: "سؤال سريع من خطة مذاكرتك اليومية", live: true },
  { href: "/break", emoji: "🧩", title: "فزورة اليوم", desc: "لغز يومي بتلميح ومحاولات محدودة", live: true },
  { href: "/escape-room", emoji: "🚪", title: "غرفة الهروب", desc: "٣ ألغاز متسلسلة في مراجعة كاملة", live: true },
  { href: "/shop", emoji: "📦", title: "الصناديق والعجلة", desc: "صناديق مفاجآت وعجلة الحظ من المتجر", live: true },
];

const UPCOMING: ArcadeCard[] = [
  { href: "/shop", emoji: "🎫", title: "Magic Battle Pass", desc: "مسار مكافآت موسمي بمستويات وجوائز", live: false },
  { href: "/shop", emoji: "🎮", title: "Game Items", desc: "عناصر الألعاب اللي هتشتريها من Market", live: false },
  { href: "/shop", emoji: "🏆", title: "بطولات موسمية", desc: "مسابقات بين الكليات وجوائز Coins", live: false },
];

function Card({ game }: { game: ArcadeCard }) {
  const inner = (
    <div className={`sheet-card flex h-full flex-col gap-2 p-5 transition ${game.live ? "hover:border-marker/60" : "opacity-60"}`}>
      <div className="flex items-center justify-between">
        <span className="text-3xl">{game.emoji}</span>
        {game.live ? (
          <span className="tag">متاحة الآن</span>
        ) : (
          <span className="tag opacity-70">قريب ✨</span>
        )}
      </div>
      <h2 className="h4 font-extrabold">{game.title}</h2>
      <p className="text-sm text-ink-soft">{game.desc}</p>
    </div>
  );
  return game.live ? (
    <Link href={game.href} className="block h-full">{inner}</Link>
  ) : (
    <div className="h-full cursor-default">{inner}</div>
  );
}

export default function GamesPage() {
  return (
    <PageShell
      eyebrow="Magicly Arcade"
      title="🕹️ مركز الألعاب"
      lede="العب، استرح، واكسب Coins — كل المكافآت مربوطة بنشاط دراسي حقيقي وحدود يومية عشان الاقتصاد يفضل متوازن."
    >
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">متاحة الآن</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g) => (
            <Card key={g.title} game={g} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">على الطريق</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UPCOMING.map((g) => (
            <Card key={g.title} game={g} />
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-soft">
        مكافآت الألعاب: ٥ Coins للفوز · سقف ٢ مكافآت يوميًا · بتشتغل بس لو ذاكرت النهارده 💪
      </p>
    </PageShell>
  );
}
