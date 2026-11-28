"use client";

// ===========================================================================
// MAGICLY — صندوق الرسائل الموحد (C13 — إعادة بناء كاملة)
// ---------------------------------------------------------------------------
// دردشات · طلبات مراسلة · دعم فني — في صفحة واحدة.
// - المحادثات بأسماء وأفاتار وآخر رسالة (زي واتساب)
// - محادثة جديدة: بحث موحّد بالاسم أو @handle أو كود MAG
// - طلب المراسلة: يتبعت → الطرف التاني يقبل → المحادثة تفتح فورًا
//   (والأصدقاء بيبقوا محادثة مباشرة من غير طلب)
// - الدعم الفني مدموج في نفس الصندوق
// - تحديث تلقائي كل 10 ثواني للمحادثات و5 ثواني للرسايل المفتوحة
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as ui from "@/components/ui";
import SupportSection from "@/components/communication/SupportSection";
import {
  Search, MessageCircle, Send, X, Plus, Inbox, LifeBuoy,
  UserPlus, Loader2, Check, ShieldAlert, Paperclip, Mic, Square,
  Pencil, Trash2, File as FileIcon, Users,
} from "lucide-react";

type Member = { user_id: string; display_name: string | null; avatar_url: string | null; last_active_at: string | null };

type Conversation = {
  id: string;
  title: string;
  other_avatar: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
  message_count: number;
  is_group?: boolean;
  group_name?: string | null;
  members?: Member[];
  participant_count?: number;
  other_last_active_at?: string | null;
};

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
  message_type?: "text" | "image" | "audio" | "file" | string;
  media_url?: string | null;
  edited_at?: string | null;
};

// مرفق جاهز للإرسال (اترفع على التخزين)
type PendingMedia = { url: string; kind: "image" | "audio" | "file"; type: string; name?: string };

type SearchResult = {
  profile_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  university: string | null;
};

type MsgRequest = {
  id: string;
  sender_id: string;
  status: string;
  note: string | null;
  created_at: string;
  direction?: "incoming" | "sent";
  sender_name: string | null;
  sender_handle: string | null;
  sender_avatar: string | null;
  receiver_name?: string | null;
  receiver_handle?: string | null;
  receiver_avatar?: string | null;
};

type Tab = "chats" | "requests" | "support";

const MAG_RE = /^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/i;

export default function InboxClient() {
  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chats");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [requests, setRequests] = useState<MsgRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // نافذة محادثة جديدة
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [requestNote, setRequestNote] = useState<{ state: "sent" | "incoming" | "error"; text: string } | null>(null);

  // نافذة جروب جديد (C18)
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [friends, setFriends] = useState<{ friend_id: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [groupPicked, setGroupPicked] = useState<Set<string>>(new Set());
  const [groupCreating, setGroupCreating] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------- وسائط + صوت + تعديل (C17)
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // ------------------------------------------------------------- تحميل
  const loadMe = useCallback(async () => {
    try {
      const { data } = await createClient().auth.getUser();
      setMe(data.user?.id ?? null);
    } catch { /* تجاهل */ }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setConversations(data.conversations ?? []);
    } catch { /* الشبكة — المرة الجاية */ }
    finally { setConvLoading(false); }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch("/api/messages/requests", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setRequests(data.requests ?? []);
    } catch { /* تجاهل */ }
    finally { setRequestsLoading(false); }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => {
    void loadConversations();
    void loadRequests();
  }, [loadConversations, loadRequests]);

  // روابط قديمة بتوصل بـ ?category=support (ردود الدعم و/support) — نفتح تاب الدعم مباشرة،
  // ولو فيه ?ticket=<id> بنفتح التذكرة نفسها (Deep-link من الإشعارات).
  const [supportTicketId, setSupportTicketId] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("category") === "support") setTab("support");
    const ticket = sp.get("ticket");
    if (ticket) { setSupportTicketId(ticket); setTab("support"); }
  }, []);

  // تحديث دوري: المحادثات كل 10 ثواني، الرسايل المفتوحة كل 5
  useEffect(() => {
    const t = setInterval(() => { void loadConversations(); }, 10_000);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConv) return;
    const t = setInterval(() => { void openConversation(selectedConv, true); }, 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [selectedConv]);

  // اللايف شات — استقبال الرسايل لحظيًا عبر Realtime (مع البولينج كشبكة أمان)
  useEffect(() => {
    if (!selectedConv) return;
    const sb = createClient();
    const ch = sb
      .channel(`messaging:${selectedConv}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConv}` },
        (payload: { new: Msg }) => {
          const row = payload.new;
          if (!row?.id) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          void loadConversations();
          requestAnimationFrame(() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConv}` },
        (payload: { new: Msg }) => {
          const row = payload.new;
          if (!row?.id) return;
          // تعديل أو حذف ناعم — نطبّق نسخة السيرفر (الحذف بيخفي الوسائط)
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
          void loadConversations();
        }
      )
      .subscribe();
    return () => { void sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv]);

  // ------------------------------------------------------------- المحادثة
  const openConversation = useCallback(async (convId: string, silent = false) => {
    if (!silent) {
      setSelectedConv(convId);
      setMsgLoading(true);
      setMessages([]);
    }
    try {
      const res = await fetch(`/api/conversations/${convId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setMessages(data.messages ?? []);
      else if (!silent) setError(data.error || "تعذّر فتح المحادثة.");
    } catch { if (!silent) setError("مشكلة شبكة."); }
    finally { setMsgLoading(false); }
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConv || sending) return;
    const body = draft.trim();
    // رسالة وسائط من غير نص ولا مرفق = مفيش حاجة تتبعت
    if (!body && !pendingMedia) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedConv}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pendingMedia
            ? { body: body || " ", message_type: pendingMedia.kind, media_url: pendingMedia.url }
            : { body },
        ),
      });
      const data = await res.json();
      if (data.success) {
        setDraft("");
        setPendingMedia(null);
        await openConversation(selectedConv, true);
        void loadConversations();
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
        });
      } else {
        setError(data.error || "الرسالة مااتبعتش.");
      }
    } catch {
      setError("مشكلة شبكة — الرسالة مااتبعتش.");
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------------- رفع وسائط (C17)
  const uploadFile = async (file: File) => {
    if (uploadingMedia || recording) return;
    setUploadingMedia(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/conversations/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setPendingMedia({ url: data.url, kind: data.kind, type: data.type, name: file.name });
      } else {
        setError(data.error || "تعذّر رفع الملف.");
      }
    } catch {
      setError("مشكلة شبكة أثناء رفع الملف.");
    } finally {
      setUploadingMedia(false);
    }
  };

  // ------------------------------------------------- تسجيل صوتي (C17)
  const startRecording = async () => {
    if (recording || sending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) await uploadFile(new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" }));
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setError("مسموحش بالمايك — اسمح للموقع بالوصول للميكروفون.");
    }
  };

  const stopRecording = (send: boolean) => {
    const mr = recorderRef.current;
    if (!mr || mr.state === "inactive") return;
    if (!send) mr.onstop = null; // إلغاء — من غير رفع
    mr.stop();
    recorderRef.current = null;
    setRecording(false);
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecordSeconds(0);
  };

  // ------------------------------------------------- تعديل/حذف رسالة (C17)
  const startEdit = (m: Msg) => { setEditingId(m.id); setEditDraft(m.body); };
  const saveEdit = async () => {
    if (!editingId || !selectedConv) return;
    const body = editDraft.trim();
    if (!body) return;
    try {
      const res = await fetch(`/api/conversations/${selectedConv}/messages/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = data.message as Msg;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
        setEditingId(null);
        setEditDraft("");
      } else {
        setError(data.error || "تعذّر التعديل.");
      }
    } catch { setError("مشكلة شبكة."); }
  };

  const deleteMessage = async (messageId: string) => {
    if (!selectedConv) return;
    try {
      const res = await fetch(`/api/conversations/${selectedConv}/messages/${messageId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, body: "", media_url: null } : m)));
        void loadConversations();
      } else {
        setError(data.error || "تعذّر الحذف.");
      }
    } catch { setError("مشكلة شبكة."); }
  };

  // إلغاء طلب مراسلة بعتّه (C17)
  const cancelRequest = async (req: MsgRequest) => {
    try {
      const res = await fetch(`/api/messages/requests/${req.id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        setError(data.error || "تعذّر إلغاء الطلب.");
      }
    } catch { setError("مشكلة شبكة."); }
  };

  // ------------------------------------------------------------- بحث المستخدمين
  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    setSearchLoading(true);
    try {
      if (MAG_RE.test(query)) {
        // كود MAG — بحث مباشر
        const res = await fetch(`/api/users/mag-lookup?mag_id=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(
          data.success && data.user
            ? [{ profile_id: data.user.profile_id, display_name: data.user.display_name, handle: data.user.handle ?? null, avatar_url: data.user.avatar_url ?? null, university: data.user.university ?? null }]
            : [],
        );
      } else {
        // اسم أو @handle — البحث العام بيفهم الاتنين (C11)
        const res = await fetch(`/api/users/search?query=${encodeURIComponent(query.replace(/^@/, ""))}`);
        const data = await res.json();
        setResults(data.success ? (data.profiles ?? []) : []);
      }
    } catch {
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void runSearch(searchInput); }, 300);
    return () => clearTimeout(t);
  }, [searchInput, runSearch]);

  const sendRequest = async (target: SearchResult) => {
    setRequestNote(null);
    try {
      const res = await fetch("/api/messages/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_profile_id: target.profile_id, note: "" }),
      });
      const data = await res.json();
      if (!data.success) {
        setRequestNote({ state: "error", text: data.error || "تعذّر إرسال الطلب." });
        return;
      }
      const status = data.request?.status as string | undefined;
      if (status === "conversation" && data.request?.conversation_id) {
        // أصدقاء → المحادثة اتفتحت فورًا
        setNewConvOpen(false);
        setSearchInput("");
        setResults([]);
        void loadConversations();
        void openConversation(data.request.conversation_id);
        return;
      }
      if (status === "incoming_pending") {
        setRequestNote({ state: "incoming", text: "ده هو اللي بعتلك طلب مراسلة — قبله من تاب «طلبات المراسلة» وهتتنفتح المحادثة." });
        void loadRequests();
        return;
      }
      setRequestNote({ state: "sent", text: `اتبعت طلب مراسلة لـ ${target.display_name ?? "الطالب"} — هيوصلله إشعار، ولما يقبل هتلاقي المحادثة هنا.` });
      setSearchInput("");
      setResults([]);
    } catch {
      setRequestNote({ state: "error", text: "مشكلة شبكة — حاول تاني." });
    }
  };

  // ------------------------------------------------------------- الجروبات (C18)
  const openGroupModal = async () => {
    setGroupOpen(true);
    setGroupName("");
    setGroupPicked(new Set());
    setFriendsLoading(true);
    try {
      const res = await fetch("/api/community/friends");
      const data = await res.json();
      setFriends(data.success ? (data.friends ?? []) : []);
    } catch { setFriends([]); }
    finally { setFriendsLoading(false); }
  };

  const toggleGroupPick = (id: string) => {
    setGroupPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupPicked.size === 0) return;
    setGroupCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName.trim(), participant_ids: [...groupPicked] }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "تعذّر إنشاء الجروب.");
        return;
      }
      setGroupOpen(false);
      setTab("chats");
      void loadConversations();
      if (data.conversation?.id) void openConversation(data.conversation.id);
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setGroupCreating(false);
    }
  };

  // حالة النشاط: «نشط الآن» لو آخر ظهور أقل من 5 دقايق
  const activityLabel = (lastActive: string | null | undefined): { text: string; online: boolean } | null => {
    if (!lastActive) return null;
    const diffMin = (Date.now() - new Date(lastActive).getTime()) / 60_000;
    if (diffMin < 5) return { text: "نشط الآن", online: true };
    if (diffMin < 60 * 24) return { text: `آخر ظهور ${new Date(lastActive).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`, online: false };
    return { text: `آخر ظهور ${new Date(lastActive).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}`, online: false };
  };

  // ------------------------------------------------------------- الطلبات
  const respondRequest = async (req: MsgRequest, accept: boolean) => {
    const url = `/api/messages/requests/${req.id}/${accept ? "accept" : "reject"}`;
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        if (accept && data.conversation?.id) {
          setTab("chats");
          void loadConversations();
          void openConversation(data.conversation.id);
        }
      } else {
        setError(data.error || "تعذّر تنفيذ الإجراء.");
      }
    } catch {
      setError("مشكلة شبكة.");
    }
  };

  // ------------------------------------------------------------- UI
  const pendingRequests = requests.filter((r) => r.status === "pending" && r.direction === "incoming");
  const selectedConvMeta = conversations.find((c) => c.id === selectedConv) ?? null;

  const avatar = (url: string | null, name: string | null, cls: string) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover`} />
    ) : (
      <div className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marker to-amber-600 font-bold text-white`}>
        {(name ?? "؟").trim().charAt(0)}
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-paper" dir="rtl">
      {/* ------------------------------------------------------- الشريط الجانبي */}
      <aside className={`flex w-full flex-col border-l border-rule/40 md:w-96 lg:w-[420px] ${selectedConv ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-rule/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <Inbox className="h-5 w-5 text-marker" />
              الرسايل
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void openGroupModal()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-marker/50 bg-marker/5 px-3 py-1.5 text-xs font-bold text-marker transition hover:bg-marker/10"
              >
                <UserPlus className="h-3.5 w-3.5" />
                جروب
              </button>
              <button
                onClick={() => { setNewConvOpen(true); setRequestNote(null); setSearchInput(""); setResults([]); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-marker px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                محادثة جديدة
              </button>
            </div>
          </div>
          <div className="flex gap-1 rounded-xl border border-rule/40 bg-paper-2/60 p-1">
            {([
              { id: "chats" as Tab, label: "الدردشة", icon: MessageCircle, badge: 0 },
              { id: "requests" as Tab, label: "الطلبات", icon: UserPlus, badge: pendingRequests.length },
              { id: "support" as Tab, label: "الدعم", icon: LifeBuoy, badge: 0 },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                  tab === t.id ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {t.badge > 0 && (
                  <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "chats" && (
            <div className="p-2">
              {convLoading ? (
                <div className="space-y-2 p-2">{[1, 2, 3].map((i) => <ui.Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <MessageCircle className="mx-auto mb-3 h-12 w-12 opacity-40" />
                  <p className="text-sm font-semibold text-ink">مفيش محادثات لسه</p>
                  <p className="mt-1 text-xs">اضغط «محادثة جديدة» وابحث بالاسم أو @المعرف أو كود MAG.</p>
                </div>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => void openConversation(c.id)}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-right transition ${
                      selectedConv === c.id ? "bg-marker/10" : "hover:bg-paper-2/70"
                    }`}
                  >
                    {avatar(c.other_avatar, c.title, "h-11 w-11 text-sm")}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-ink">
                          {c.is_group && <Users className="ml-1 inline h-3.5 w-3.5 text-marker" />}
                          {c.title}
                        </span>
                        {c.last_message_at && (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {new Date(c.last_message_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        {c.last_message_body || `${c.message_count} رسالة`}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "requests" && (
            <div className="p-3">
              <h2 className="mb-3 text-sm font-bold text-ink">طلبات المراسلة</h2>
              <p className="mb-3 -mt-2 text-[11px] text-slate-400">الواصلة ليك تحت — واللي بعتّها تحتايهم بتقدر تلغيها.</p>
              {requestsLoading ? (
                <ui.Skeleton className="h-20 w-full" />
              ) : pendingRequests.length === 0 ? (
                <div className="p-6 text-center">
                  <UserPlus className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                  <p className="text-sm text-ink-soft">مفيش طلبات مراسلة معلّقة.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pendingRequests.map((r) => (
                    <li key={r.id} className="rounded-xl border border-rule/50 bg-paper-2/50 p-3">
                      <div className="flex items-center gap-3">
                        {avatar(r.sender_avatar, r.sender_name, "h-9 w-9 text-xs")}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">{r.sender_name ?? "طالب"}</p>
                          {r.sender_handle && (
                            <p className="font-mono text-[10px] text-marker" dir="ltr">@{r.sender_handle}</p>
                          )}
                          {r.note ? <p className="mt-0.5 truncate text-xs text-ink-soft">«{r.note}»</p> : null}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => void respondRequest(r, true)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            قبول
                          </button>
                          <button
                            onClick={() => void respondRequest(r, false)}
                            className="rounded-lg bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper-3"
                          >
                            رفض
                          </button>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-400">{new Date(r.created_at).toLocaleString("ar-EG")}</p>
                    </li>
                  ))}
                </ul>
              )}
              {/* الطلبات اللي بعتها أنت — معلقة (تنلغي) وماليها رد (C17) */}
              {requests.some((r) => r.direction === "sent") && (
                <div className="mt-4">
                  <h3 className="mb-2 text-[11px] font-bold text-slate-400">الطلبات اللي بعتّها</h3>
                  <ul className="space-y-1.5">
                    {requests.filter((r) => r.direction === "sent").slice(0, 15).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-lg bg-paper-2/40 px-3 py-2 text-xs">
                        {avatar(r.receiver_avatar ?? null, r.receiver_name ?? null, "h-7 w-7 text-[10px]")}
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.receiver_name ?? "طالب"}</span>
                        {r.status === "pending" ? (
                          <>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">معلّق</span>
                            <button
                              onClick={() => void cancelRequest(r)}
                              className="shrink-0 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100"
                            >
                              إلغاء
                            </button>
                          </>
                        ) : (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {r.status === "accepted" ? "اتقبل ✓" : r.status === "rejected" ? "اترفض" : r.status === "canceled" ? "ألغيته" : "انتهى"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "support" && (
            <div className="p-3">
              <SupportSection initialTicketId={supportTicketId} />
            </div>
          )}
        </div>
      </aside>

      {/* ----------------------------------------------------------- الشاشة */}
      <main className={`flex min-w-0 flex-1 flex-col ${selectedConv ? "flex" : "hidden md:flex"}`}>
        {!selectedConv ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <ui.Card className="w-full max-w-md p-8 text-center">
              <MessageCircle className="mx-auto mb-4 h-14 w-14 text-slate-300" />
              <h2 className="mb-2 text-xl font-extrabold text-ink">صندوق الرسايل</h2>
              <p className="mb-4 text-sm text-ink-soft">
                تواصل مع زمايلك، اقبل طلبات المراسلة، وكلمنا في الدعم — كله من هنا.
              </p>
              <button
                onClick={() => { setTab("chats"); setNewConvOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-marker px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> ابدأ محادثة
              </button>
            </ui.Card>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-rule/40 bg-paper-2/40 px-4 py-3">
              <button onClick={() => setSelectedConv(null)} className="rounded-lg p-1 hover:bg-paper-3 md:hidden" aria-label="رجوع">
                <X className="h-5 w-5 text-ink-soft" />
              </button>
              {avatar(selectedConvMeta?.other_avatar ?? null, selectedConvMeta?.title ?? "محادثة", "h-9 w-9 text-xs")}
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold text-ink">{selectedConvMeta?.title ?? "محادثة"}</h2>
                {selectedConvMeta?.is_group ? (
                  <p className="truncate text-[11px] text-slate-400">
                    {(selectedConvMeta.members ?? []).map((mm) => mm.display_name || "طالب").join("، ") || "جروب مذاكرة"}
                  </p>
                ) : (() => {
                  const act = activityLabel(selectedConvMeta?.other_last_active_at);
                  return act ? (
                    <p className={`flex items-center gap-1 text-[11px] ${act.online ? "text-emerald-600" : "text-slate-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${act.online ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
                      {act.text}
                    </p>
                  ) : null;
                })()}
              </div>
            </header>

            <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {msgLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <ui.Skeleton key={i} className="h-14 w-2/3" />)}</div>
              ) : messages.length === 0 ? (
                <div className="pt-12 text-center text-slate-400">
                  <p className="text-sm font-semibold">ابدأ المحادثة</p>
                  <p className="mt-1 text-xs">ابعت أول رسالة.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_id === me;
                  const deleted = m.is_deleted;
                  const isEditing = editingId === m.id;
                  return (
                    <div key={m.id} className={`group flex items-end gap-1.5 ${mine ? "justify-start" : "justify-end"}`}>
                      {/* أدوات رسايلي: تعديل/حذف */}
                      {mine && !deleted && !isEditing ? (
                        <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                          {m.message_type === "text" || !m.message_type ? (
                            <button
                              onClick={() => startEdit(m)}
                              className="rounded-md p-1 text-slate-400 hover:bg-paper-3 hover:text-ink"
                              aria-label="تعديل الرسالة" title="تعديل"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            onClick={() => void deleteMessage(m.id)}
                            className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="حذف الرسالة" title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          deleted
                            ? "border border-dashed border-rule/60 bg-paper-2/50 italic text-slate-400"
                            : mine ? "bg-marker text-white" : "border border-rule/50 bg-paper-2 text-ink"
                        }`}
                      >
                        {deleted ? (
                          <p>اتمسحت الرسالة 🗑️</p>
                        ) : isEditing ? (
                          <div className="w-64">
                            <textarea
                              autoFocus
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(); }
                                if (e.key === "Escape") { setEditingId(null); setEditDraft(""); }
                              }}
                              rows={2}
                              className="w-full resize-none rounded-lg border border-rule/50 bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-marker"
                            />
                            <div className="mt-1.5 flex gap-1.5">
                              <button onClick={() => void saveEdit()} className="rounded-md bg-marker px-2.5 py-1 text-xs font-bold text-white">حفظ</button>
                              <button onClick={() => { setEditingId(null); setEditDraft(""); }} className="rounded-md bg-paper-3 px-2.5 py-1 text-xs text-ink-soft">إلغاء</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* اسم المرسل في الجروبات */}
                            {selectedConvMeta?.is_group && !mine && (
                              <p className="mb-0.5 text-[11px] font-bold text-marker">
                                {selectedConvMeta.members?.find((mm) => mm.user_id === m.sender_id)?.display_name ?? "طالب"}
                              </p>
                            )}
                            {/* الوسائط */}
                            {m.message_type === "image" && m.media_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.media_url} alt="مرفق" className="mb-1.5 max-h-64 rounded-xl border border-white/20 object-cover" />
                            ) : null}
                            {m.message_type === "audio" && m.media_url ? (
                              <audio controls src={m.media_url} className="mb-1.5 max-w-56" />
                            ) : null}
                            {m.message_type === "file" && m.media_url ? (
                              <a href={m.media_url} target="_blank" rel="noopener noreferrer"
                                className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs font-semibold underline">
                                <FileIcon className="h-3.5 w-3.5" /> فتح المرفق
                              </a>
                            ) : null}
                            {m.body && m.body !== " " ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                            <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                              {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                              {m.edited_at ? " · عدّلت" : ""}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {error && (
              <div className="mx-4 mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <ShieldAlert className="ml-1 inline h-3.5 w-3.5" /> {error}
              </div>
            )}

            {/* معاينة المرفق قبل الإرسال (C17) */}
            {pendingMedia ? (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-rule/50 bg-paper-2/70 p-2">
                {pendingMedia.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pendingMedia.url} alt="مرفق" className="h-12 w-12 rounded-lg object-cover" />
                ) : pendingMedia.kind === "audio" ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marker/10 text-marker"><Mic className="h-4 w-4" /></span>
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marker/10 text-marker"><FileIcon className="h-4 w-4" /></span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                  {pendingMedia.kind === "audio" ? "تسجيل صوتي جاهز" : pendingMedia.name || "مرفق جاهز"}
                </span>
                <button onClick={() => setPendingMedia(null)} className="rounded p-1 text-slate-400 hover:text-rose-600" aria-label="إزالة المرفق">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {recording ? (
              <div className="flex items-center gap-2 border-t border-rule/40 bg-paper-2/40 p-3">
                <span className="flex h-3 w-3 shrink-0 animate-pulse rounded-full bg-rose-600" aria-hidden="true" />
                <span className="flex-1 text-sm font-semibold text-ink">
                  بيسجل… <span className="ltr-num tnum">{recordSeconds}</span> ثانية
                </span>
                <button onClick={() => stopRecording(false)} className="rounded-lg bg-paper px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper-3">إلغاء</button>
                <button onClick={() => stopRecording(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-marker px-3.5 py-2 text-xs font-bold text-white hover:opacity-90">
                  <Square className="h-3.5 w-3.5" /> إرسال التسجيل
                </button>
              </div>
            ) : (
              <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-rule/40 bg-paper-2/40 p-3">
                <input
                  type="file"
                  accept="image/*,application/pdf,text/plain,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFile(f);
                    e.target.value = "";
                  }}
                  id="chat-media-input"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById("chat-media-input")?.click()}
                  disabled={uploadingMedia || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rule/50 bg-paper text-ink-soft transition hover:text-marker disabled:opacity-40"
                  aria-label="إرفاق صورة أو ملف" title="إرفاق"
                >
                  {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={uploadingMedia || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rule/50 bg-paper text-ink-soft transition hover:text-marker disabled:opacity-40"
                  aria-label="تسجيل صوتي" title="رسالة صوتية"
                >
                  <Mic className="h-4 w-4" />
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(e); }
                  }}
                  rows={1}
                  placeholder={pendingMedia ? "اكتب تعليق على المرفق (اختياري)…" : "اكتب رسالتك… (Enter للإرسال)"}
                  className="max-h-32 min-h-11 w-full flex-1 resize-none rounded-xl border border-rule/50 bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-marker"
                />
                <button
                  type="submit"
                  disabled={(!draft.trim() && !pendingMedia) || sending || uploadingMedia}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-marker text-white transition hover:opacity-90 disabled:opacity-40"
                  aria-label="إرسال"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            )}
          </>
        )}
      </main>

      {/* ------------------------------------------------ نافذة جروب جديد */}
      {groupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-paper shadow-2xl">
            <div className="flex items-center justify-between border-b border-rule/40 p-4">
              <h2 className="text-lg font-extrabold text-ink">جروب مذاكرة جديد</h2>
              <button onClick={() => setGroupOpen(false)} className="rounded-lg p-1.5 hover:bg-paper-2" aria-label="إغلاق">
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <input
                autoFocus
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="اسم الجروب (مثال: مذاكرة فيزيا — ثانية ثانوي)…"
                maxLength={60}
                className="w-full rounded-xl border border-rule/50 bg-paper-2/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-marker"
              />
              {friendsLoading ? (
                <div className="py-3 text-center text-xs text-slate-400"><Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" /> جاري تحميل أصحابك…</div>
              ) : friends.length === 0 ? (
                <div className="rounded-xl bg-paper-2/50 p-4 text-center text-xs text-slate-400">
                  مفيش أصدقاء لسه — ضيف أصحاب من صفحة المجتمع الأول، وبعدها تقدر تعمل جروب.
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-400">اختار الأعضاء ({groupPicked.size} مختار):</p>
                  <ul className="space-y-1.5">
                    {friends.map((f) => (
                      <li key={f.friend_id}>
                        <button
                          onClick={() => toggleGroupPick(f.friend_id)}
                          className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-right transition ${
                            groupPicked.has(f.friend_id) ? "border-marker bg-marker/5" : "border-rule/40 hover:bg-paper-2/70"
                          }`}
                        >
                          {avatar(f.avatar_url, f.display_name, "h-9 w-9 text-xs")}
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{f.display_name ?? "طالب"}</span>
                          {groupPicked.has(f.friend_id) && <Check className="h-4 w-4 shrink-0 text-marker" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                onClick={() => void createGroup()}
                disabled={!groupName.trim() || groupPicked.size === 0 || groupCreating}
                className="w-full rounded-xl bg-marker py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {groupCreating ? <Loader2 className="ml-1 inline h-4 w-4 animate-spin" /> : null}
                إنشاء الجروب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ نافذة محادثة جديدة */}
      {newConvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-paper shadow-2xl">
            <div className="flex items-center justify-between border-b border-rule/40 p-4">
              <h2 className="text-lg font-extrabold text-ink">محادثة جديدة</h2>
              <button onClick={() => setNewConvOpen(false)} className="rounded-lg p-1.5 hover:bg-paper-2" aria-label="إغلاق">
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="اسم الطالب، @معرّفه، أو كود MAG…"
                  className="w-full rounded-xl border border-rule/50 bg-paper-2/50 py-2.5 pl-3 pr-9 text-sm text-ink outline-none focus:border-marker"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                لو أنتم أصدقاء هتتنفتح المحادثة فورًا، وغير كده هيتبعت طلب مراسلة يستنى موافقته.
              </p>

              {searchLoading ? (
                <div className="py-3 text-center text-xs text-slate-400"><Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" /> جاري البحث…</div>
              ) : searchInput.trim().length >= 2 ? (
                results.length === 0 ? (
                  <div className="rounded-xl bg-paper-2/50 p-4 text-center text-xs text-slate-400">
                    مفيش نتائج — جرّب اسم تاني أو @المعرف أو كود MAG كامل.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {results.slice(0, 8).map((u) => (
                      <li key={u.profile_id}>
                        <button
                          onClick={() => void sendRequest(u)}
                          className="flex w-full items-center gap-3 rounded-xl border border-rule/40 p-2.5 text-right transition hover:border-marker/50 hover:bg-marker/5"
                        >
                          {avatar(u.avatar_url, u.display_name, "h-9 w-9 text-xs")}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">{u.display_name ?? "طالب"}</p>
                            <p className="truncate text-[11px] text-slate-400" dir="ltr">
                              {u.handle ? `@${u.handle}` : (u.university ?? "")}
                            </p>
                          </div>
                          <UserPlus className="h-4 w-4 shrink-0 text-marker" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              {requestNote && (
                <div className={`rounded-xl border p-3 text-sm ${
                  requestNote.state === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : requestNote.state === "incoming"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}>
                  {requestNote.state === "sent" && <Check className="ml-1 inline h-4 w-4" />}
                  {requestNote.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
