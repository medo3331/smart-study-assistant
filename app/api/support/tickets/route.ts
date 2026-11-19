import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const CATEGORIES = new Set(["login", "account", "payment", "bug", "content", "performance", "other"]);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

    const service = createServiceClient();
    const { data, error } = await service.from("support_tickets").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) throw error;

    const tickets = data ?? [];
    const ticketIds = tickets.map((ticket) => ticket.id);
    const latestByTicket = new Map<string, string>();
    if (ticketIds.length) {
      const { data: messages, error: messagesError } = await service.from("support_messages").select("ticket_id, body, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: false });
      if (messagesError) throw messagesError;
      for (const message of messages ?? []) if (!latestByTicket.has(message.ticket_id)) latestByTicket.set(message.ticket_id, message.body);
    }
    return NextResponse.json({ success: true, tickets: tickets.map((ticket) => ({ ...ticket, subject: ticket.subject || ticket.title || "طلب دعم", last_message: latestByTicket.get(ticket.id) ?? null })) });
  } catch (error) {
    console.error("[support] GET", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "تعذر تحميل تذاكر الدعم." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const category = body.category === undefined ? "other" : body.category;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!subject || subject.length > 200) return NextResponse.json({ success: false, error: "Invalid subject." }, { status: 400 });
    if (typeof category !== "string" || !CATEGORIES.has(category)) return NextResponse.json({ success: false, error: "Invalid category." }, { status: 400 });
    if (message.length < 10 || message.length > 5000) return NextResponse.json({ success: false, error: "اكتب تفاصيل المشكلة من 10 إلى 5000 حرف." }, { status: 400 });

    const service = createServiceClient();
    const { data: ticket, error: ticketError } = await service.from("support_tickets").insert({ user_id: user.id, title: subject, subject, description: message, category, status: "open" }).select("*").single();
    if (ticketError || !ticket) {
      console.error("[support] POST ticket", ticketError?.message);
      return NextResponse.json({ success: false, error: "تعذر إنشاء تذكرة الدعم." }, { status: 500 });
    }
    const { error: messageError } = await service.from("support_messages").insert({ ticket_id: ticket.id, author_id: user.id, author_role: "user", body: message });
    if (messageError) {
      console.error("[support] POST message", messageError.message);
      // Avoid leaving an empty ticket behind if its first message could not be saved.
      await service.from("support_tickets").delete().eq("id", ticket.id).eq("user_id", user.id);
      return NextResponse.json({ success: false, error: "تعذر حفظ أول رسالة. لم يتم إنشاء التذكرة." }, { status: 500 });
    }
    return NextResponse.json({ success: true, ticket, reference: ticket.id }, { status: 201 });
  } catch (error) {
    console.error("[support] POST", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
