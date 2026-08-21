import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/dashboard";
  return raw;
}

// هذا الملف مسؤول عن استقبال المستخدم بعد ما يضغط على الرابط السحري في إيميله
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

if (code) {
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    return NextResponse.redirect(`${origin}${next}`);
  }
  console.error("exchangeCodeForSession error:", error.message);
}

  // في حالة فشل الرابط (منتهي الصلاحية مثلاً) رجّعه لصفحة الدخول
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
