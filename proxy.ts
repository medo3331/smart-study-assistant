import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * 🛡️ طبقة الحماية على مستوى الخادم (Next 16: اسم الملف proxy بدل middleware).
 *
 * شغلها:
 *   ١. تجديد توكن الجلسة تلقائيًا (كان ناقص قبل كده — مفيش middleware شغال).
 *   ٢. داشبوردات الأدوار (/dashboard/student|graduate|freelancer) للحسابات
 *      الحقيقية فقط، وكل دور يفتح دوره هو بس — غير كده fallback للداشبورد العام.
 *   ٣. /onboarding محجوب عن اللي خلّصه بالفعل.
 *   ٤. اللي خلّص الأونبوردنج ما بيشوفش شاشات الحساب تاني (welcome/login/register).
 *
 * ⚠️ قرار الدور هنا استرشادي من JWT metadata؛ المصدر النهائي profiles.role
 *    المولَّد من persona — والصفحة نفسها بتقرا الداتابيز وتوجّه نهائيًا.
 *    ده نفس نمط «استرشاد ثم تحقق» الموجود في باقي التطبيق.
 * ⚠️ منطق خريطة الدور منسوخ هنا عن قصد (مش import) — الـproxy المفروض
 *    مايعتمدش على موديولات مشتركة زي ما توثيق Next بيوصي.
 */

/** صفحات الحساب اللي المستخدم المكتمل ما محتاجش يرجع لها. */
const ACCOUNT_PATHS = new Set(["/welcome", "/login", "/register", "/onboarding"]);

function isProtected(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function isAccountPath(pathname: string): boolean {
  return ACCOUNT_PATHS.has(pathname);
}

/** وجهة الدور — نفس خريطة lib/auth-roles.ts (منسوخة عمدًا، شوف التعليق فوق). */
function roleHome(role: unknown): string {
  if (role === "student") return "/dashboard/student";
  if (role === "graduate") return "/dashboard/graduate";
  if (role === "freelancer") return "/dashboard/freelancer";
  return "/dashboard";
}

function redirectWith(url: URL | string, request: NextRequest): NextResponse {
  const target = typeof url === "string" ? new URL(url, request.url) : url;
  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // مفيش شغلانة هنا؟ عدّي على طول — الباقي من التطبيق مش متأثر أبدًا.
  if (!isProtected(pathname) && !isAccountPath(pathname)) return NextResponse.next();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() مش getSession(): بيتحقق من التوكن عند السيرفر وبيرفض المنتهي،
  // وبيتجدّد تلقائيًا عبر setAll فوق — ده اللي بيخلّي الجلسة عمرها ما تقعد ميتة.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* ---- ١) مفيش جلسة أو جلسة زائر ----
     الزائر (anonymous) اليوم مسموح له بـ/dashboard العادية (الصفحة بتعملله
     جلسة تلقائيًا — سلوك موجود ومش هنكسره)، لكن داشبوردات الأدوار محجوبة
     عليه لأن مالوش حساب أصلًا. */
  const isGuest = !user || user.is_anonymous;

  if (isProtected(pathname)) {
    // داشبورد دور محدد؟ للزائر: دخول. لحساب حقيقي: الفحص تحت.
    const roleMatch = pathname.match(/^\/dashboard\/(student|graduate|freelancer)(\/|$)/);
    if (roleMatch && isGuest) {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      url.searchParams.set("next", pathname + search);
      return redirectWith(url, request);
    }
    if (roleMatch && user && user.user_metadata?.role !== roleMatch[1]) {
      // دور حد تاني؟ رجوع للداشبورد العام بدون إعادة توجيه لوبية — rewrite صامت.
      return NextResponse.rewrite(new URL("/dashboard", request.url));
    }
    return supabaseResponse;
  }

  /* ---- ٢) مسارات الحساب (welcome/login/register/onboarding) ---- */
  if (!user) {
    if (pathname === "/onboarding") {
      // الأونبوردنج محتاج حساب حقيقي — مفيش جلسة أصلًا؟ البداية من الترحيب.
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      return redirectWith(url, request);
    }
    // باقي الشاشات هي بالظبط مكانه — عدّي.
    return supabaseResponse;
  }

  if (user.is_anonymous) {
    // الزائر بيشوف login/register (فيه تدفّق ترقية الحساب هناك)، لكن
    // الأونبوردنج للحواسب الحقيقية بس — يرجع للترحيب يقرر: يرقّي حسابه ولا لا.
    if (pathname === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      return redirectWith(url, request);
    }
    return supabaseResponse;
  }

  /* ---- ٣) حساب حقيقي: اقرا الاسترشاد من metadata ---- */
  const meta = user.user_metadata as { role?: unknown; onboarded_at?: unknown };
  const onboardedHint = Boolean(meta?.onboarded_at);

  if (pathname === "/onboarding" && onboardedHint) {
    // خلّص خلاص؟ على طول لدوره — الصفحة نفسها هتتحقق من الداتابيز كمان.
    return redirectWith(roleHome(meta.role), request);
  }

  if (pathname !== "/onboarding" && onboardedHint) {
    // مستخدم مكتمل ماشي على welcome/login/register؟ ملوش شغل هناك.
    const url = request.nextUrl.clone();
    url.pathname = roleHome(meta.role);
    url.search = pathname === "/login" ? "" : url.search;
    return redirectWith(url, request);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/welcome", "/login", "/register", "/onboarding"],
};
