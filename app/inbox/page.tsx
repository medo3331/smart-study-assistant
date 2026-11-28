'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as ui from "../../components/ui";
import SupportSection from "../../components/communication/SupportSection";
import { Search, MessageCircle, Send, Paperclip, X, User as UserIcon, Plus } from "lucide-react";
import Link from "next/link";

type Conversation = {
  id: string;
  title: string;
  status: string;
  participant_count: number;
  unread_count: number;
  last_message_at: string | null;
  message_count: number;
  other_avatar?: string | null;
  last_message_body?: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
};

type InboxCategory = "inbox" | "sent" | "notifications" | "conversations" | "archived" | "requests" | "support";

export default function InboxPage() {
  const [category, setCategory] = useState<InboxCategory>("inbox");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [draft, setDraft] = useState("");
  const [inboxRequests, setInboxRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const loadConversations = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const url = `/api/conversations?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) setError(data.error || "Failed to load conversations.");
      else setConversations(data.conversations || []);
    } catch (e) {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) { setUserSearchResults([]); return; }
    setUserSearchLoading(true);
    try {
      const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setUserSearchResults(data.success ? (data.profiles || data.users || []) : []);
    } catch {
      setUserSearchResults([]);
    } finally {
      setUserSearchLoading(false);
    }
  };

  const startConversation = async (userId: string) => {
    if (!userId) return;

    // 1. Send a message request (DO NOT create conversation directly)
    // The recipient must accept it, THEN the conversation opens.
    try {
      const res = await fetch("/api/messages/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_profile_id: userId, note: "" }),
      });
      const data = await res.json();

      if (data.success) {
        // Request sent successfully - show pending state
        setNewRequestSent(true);
        setNewRequestError(null);
        // Close the modal
        setIsNewConvOpen(false);
        // Clear search
        setSearchQuery("");
        setUserSearchResults([]);
        // Notify the user to wait for acceptance
        alert("تم إرسال طلب المراسلة. يرجى انتظار قبول الطرف الآخر.");
      } else {
        setNewRequestError(data.error || "Failed to send request.");
        // Allow user to try again or cancel
        setTimeout(() => setNewRequestError(null), 5000);
      }
    } catch {
      setNewRequestError("Network error. Please try again.");
      setTimeout(() => setNewRequestError(null), 5000);
    }
  };

  // New request state
  const [newRequestSent, setNewRequestSent] = useState(false);
  const [newRequestError, setNewRequestError] = useState<string | null>(null);

  const loadMessages = async (convId: string) => {
    setMsgLoading(true);
    try {
      const res = await fetch(`/api/conversations/${convId}/messages?limit=50`);
      const data = await res.json();
      if (!data.success) setError(data.error || "Failed to load messages.");
      else setMessages(data.messages || []);
    } catch (e) {
      setError("Network error.");
    } finally {
      setMsgLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selectedConv) return;
    const res = await fetch(`/api/conversations/${selectedConv}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    const data = await res.json();
    if (data.success) {
      setDraft("");
      loadMessages(selectedConv);
      const el = document.getElementById("messages-list");
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      alert("Failed: " + (data.error || "Unknown error"));
    }
  };

  const loadConversation = async (convId: string) => {
    setSelectedConv(convId);
    setMsgLoading(true);
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      const data = await res.json();
      if (data.success) setMessages(data.messages || []);
    } catch (e) {
      setError("Network error.");
    } finally {
      setMsgLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file || !selectedConv) return;
    formData.append("file", file);
    formData.append("conversation_id", selectedConv);
    const res = await fetch("/api/files/message-attachments", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      alert(`Uploaded: ${data.file.name}`);
      loadMessages(selectedConv);
    } else {
      alert("Upload failed: " + (data.error || "Unknown error"));
    }
  };

  const sortedConversations = [...conversations].sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });

  // بيانات المحادثة المفتوحة — عشان الهيدر يعرض اسم الطرف التاني مش نص عام
  const selectedConvData = conversations.find((c) => c.id === selectedConv) ?? null;

  // === NEW CONVERSATION MODAL STATE ===
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<"name" | "mag_id">("name");
  const [magIdInput, setMagIdInput] = useState("");
  const [magIdLoading, setMagIdLoading] = useState(false);
  const [magIdResult, setMagIdResult] = useState<any>(null);

  // Load message requests
  const loadMessageRequests = async () => {
    try {
      const res = await fetch("/api/messages/requests");
      const data = await res.json();
      if (data.success) {
        setInboxRequests(data.requests || []);
      }
    } catch (e) {
      // Ignore errors - fallback to empty
    }
  };

  // ريدايركت الدعم القديم (/support و/dashboard/support) بييجي بـ?category=support —
  // فنفتح تاب الدعم مباشرة من الرابط (الصفحة client فمابتقدرش تقرا searchParams سيرفر سايد).
  useEffect(() => {
    // تحميل المستخدم الحالي — من غيره الرسايل مابتتعرفش تميّز اتجاه المُرسل
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        setUser(data.user ?? null);
      } catch {
        // تجاهل
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    const allowed: InboxCategory[] = ["inbox", "sent", "notifications", "conversations", "archived", "requests", "support"];
    if (cat && allowed.includes(cat as InboxCategory)) setCategory(cat as InboxCategory);
  }, []);

  useEffect(() => {
    loadConversations(searchQuery);
    loadMessageRequests();
  }, [category, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query) {
      setUserSearchResults([]);
      setTimeout(() => searchUsers(query), 300);
    } else {
      setUserSearchResults([]);
    }
  };

  // === MAG ID LOOKUP ===
  const handleMagIdLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magIdInput.trim()) return;
    setMagIdLoading(true);
    setMagIdResult(null);
    try {
      const res = await fetch(`/api/users/mag-lookup?mag_id=${encodeURIComponent(magIdInput.trim())}`);
      const data = await res.json();
      if (data.success && data.user) {
        setMagIdResult(data.user);
        setSearchTarget("name"); // Switch to name search mode after lookup
        // Open the name search with the found user's profile
        setTimeout(() => {
          // The search box will show the found user
        }, 100);
      } else {
        setMagIdResult(null); // Generic "not found" (no user enumeration)
      }
    } catch {
      setMagIdResult(null); // Generic error (no user enumeration)
    } finally {
      setMagIdLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-paper">
      {/* Sidebar */}
      <div className="w-full md:w-1/3 lg:w-2/5 border-r border-border/30 bg-paper/50 flex flex-col">
        <div className="p-4 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <ui.Input
              placeholder="ابحث بالاسم أو @المعرف أو محادثة…"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
              className="pl-9"
            />
            {searchQuery && userSearchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-paper border border-border rounded-xl shadow-xl overflow-hidden">
                {userSearchResults.map((u: any) => (
                  <button
                    key={u.profile_id}
                    onClick={() => {
                      // Open discover page with search query pre-filled after selection
                      startConversation(u.profile_id);
                    }}
                    className="w-full px-4 py-3 text-right hover:bg-paper/50 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-sm font-bold">
                      {u.display_name?.charAt(0) || "?"}
                    </div>
                    <div className="text-sm text-ink">{u.display_name}</div>
                    <div className="text-xs text-slate-400 truncate" dir="ltr">
                      {u.handle ? `@${u.handle}` : (u.university ?? "")}
                    </div>
                  </button>
                ))}
                {userSearchLoading && (
                  <div className="px-4 py-3 text-xs text-slate-400">جاري البحث...</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-paper/30 rounded-xl border border-border/30">
          <button
            onClick={() => setIsNewConvOpen(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            محادثة جديدة
          </button>
          <button
            onClick={() => setCategory("inbox")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${`${category === "inbox" ? "bg-paper-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-paper/50"}`}`}
          >
            💬 الدردشة
          </button>
          <button
            onClick={() => setCategory("requests")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${`${category === "requests" ? "bg-paper-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-paper/50"}`}`}
          >
            📥 طلبات المراسلة
          </button>
          <button
            onClick={() => setCategory("support")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${`${category === "support" ? "bg-paper-2 text-ink" : "text-ink-soft hover:text-ink hover:bg-paper/50"}`}`}
          >
            🛠️ الدعم الفني
          </button>
        </div>
        {isNewConvOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-paper border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-border/30">
                <h2 className="text-lg font-semibold text-ink">محادثة جديدة</h2>
                <button
                  onClick={() => setIsNewConvOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-paper/50 text-ink-soft"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Search Mode Selection */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setSearchTarget("name"); setMagIdInput(""); setMagIdResult(null); }}
                    className={`p-3 rounded-xl border text-right transition-colors ${searchTarget === "name" ? "border-blue-500 bg-blue-50/50" : "border-border/30 hover:border-border"}`}
                  >
                    <div className="text-sm font-medium text-ink">بحث بالاسم</div>
                    <div className="text-xs text-slate-400 mt-0.5">البحث بأسم المستخدم</div>
                  </button>
                  <button
                    onClick={() => { setSearchTarget("mag_id"); setMagIdInput(""); setMagIdResult(null); }}
                    className={`p-3 rounded-xl border text-right transition-colors ${searchTarget === "mag_id" ? "border-blue-500 bg-blue-50/50" : "border-border/30 hover:border-border"}`}
                  >
                    <div className="text-sm font-medium text-ink">بحث بـ MAG ID</div>
                    <div className="text-xs text-slate-400 mt-0.5">البحث بالرقم الداخلي (آمن)</div>
                  </button>
                </div>

                {/* Search Input */}
                {searchTarget === "name" ? (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <ui.Input
                      placeholder="ابحث عن طالب بالاسم أو @المعرف…"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); }}
                      className="pl-9"
                    />
                    {searchQuery && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-paper border border-border rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto z-50">
                        {userSearchLoading ? (
                          <div className="px-4 py-3 text-xs text-slate-400">جاري البحث...</div>
                        ) : userSearchResults.length > 0 ? (
                          userSearchResults.map((u: any) => (
                            <button
                              key={u.profile_id}
                              onClick={() => {
                                setSearchQuery(u.display_name);
                                startConversation(u.profile_id);
                                setIsNewConvOpen(false);
                              }}
                              className="w-full px-4 py-3 text-right hover:bg-paper/50 flex items-center gap-3"
                            >
                              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-sm font-bold">
                                {u.display_name?.charAt(0) || "?"}
                              </div>
                              <div className="text-sm text-ink">{u.display_name}</div>
                              <div className="text-xs text-slate-400 truncate" dir="ltr">
                                {u.handle ? `@${u.handle}` : (u.university ?? "")}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-xs text-slate-400">لم يتم العثور على مستخدمين</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleMagIdLookup} className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <ui.Input
                      placeholder="MAG-XXX-XXXX"
                      value={magIdInput}
                      onChange={(e) => setMagIdInput(e.target.value)}
                      className="pl-9"
                      dir="ltr"
                    />
                    <button
                      type="submit"
                      disabled={magIdLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {magIdLoading ? "جاري..." : "بحث"}
                    </button>
                    {magIdResult && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-paper border border-border rounded-xl shadow-xl overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white text-sm font-bold">
                            {magIdResult.display_name?.charAt(0) || "?"}
                          </div>
                          <div className="text-sm text-ink">
                            <div className="font-medium">{magIdResult.display_name}</div>
                            <div className="text-xs text-slate-400">{magIdResult.university} · {magIdResult.faculty}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            startConversation(magIdResult.profile_id);
                            setIsNewConvOpen(false);
                          }}
                          className="w-full px-4 py-3 text-right hover:bg-paper/50 flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold">
                            ✓
                          </div>
                          <div className="text-sm text-ink">إرسال طلب مراسلة إلى {magIdResult.display_name}</div>
                        </button>
                      </div>
                    )}
                  </form>
                )}

                {/* Request Sent State */}
                {newRequestSent && (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-center">
                    <div className="text-emerald-600 text-sm font-medium">
                      ✓ تم إرسال طلب المراسلة
                    </div>
                    <div className="text-emerald-500 text-xs mt-1">
                      يرجى انتظار قبول الطرف الآخر. لا توجد محادثة جديدة حتى يتم قبول الطلب.
                    </div>
                  </div>
                )}

                {/* Request Error State */}
                {newRequestError && (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-center">
                    <div className="text-red-600 text-sm font-medium">
                      {newRequestError}
                    </div>
                    <div className="text-red-400 text-xs mt-1">
                      يمكنك المحاولة مرة أخرى أو إغلاق النافذة.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 p-4 border-t border-border/30">
                <button
                  onClick={() => setIsNewConvOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft hover:bg-paper/50"
                >
                  إغلاق
                </button>
                <button
                  onClick={() => {
                    if (searchQuery && userSearchResults.length > 0) {
                      const selected = userSearchResults[0];
                      startConversation(selected.profile_id);
                      setIsNewConvOpen(false);
                    } else if (magIdResult) {
                      startConversation(magIdResult.profile_id);
                      setIsNewConvOpen(false);
                    } else {
                      setIsNewConvOpen(false);
                    }
                  }}
                  disabled={!searchQuery && !magIdResult}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  إرسال طلب مراسلة
                </button>
              </div>
            </div>
          </div>
        )}        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-4">
            <h2 className="text-sm font-semibold text-ink">الرسائل</h2>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <ui.Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : sortedConversations.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">لا توجد محادثات</p>
              <p className="text-xs mt-1">ابدأ محادثة جديدة للاتصال</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedConversations.map((conv, i) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors ${
                    selectedConv === conv.id
                      ? "bg-paper-8/60 border-border/50"
                      : "hover:bg-paper/40 border-border/30"
                  }`}
                >
                  {conv.other_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={conv.other_avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">
                      {(conv.title || "؟").trim().charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-ink truncate">{conv.title}</h3>
                      {conv.last_message_at && (
                        <span className="text-xs text-slate-400">
                          {new Date(conv.last_message_at).toLocaleDateString("ar-EG")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 truncate">
                      {conv.last_message_body || `${conv.message_count} رسالة`}
                      {conv.unread_count > 0 && <span className="text-amber-500 font-medium">({conv.unread_count} غير مقروء)</span>}
                    </p>
                  </div>
                  {selectedConv === conv.id && (
                    <span className="text-xs text-emerald-400 flex-shrink-0 ml-2">مفتوح</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message Requests Section */}
        {requestsLoading ? (
          <div className="px-4 py-2">
            <ui.Skeleton className="h-24 w-full" />
        {category === "support" && (
          <div className="px-4 py-4">
            <SupportSection />
          </div>
        )}

        {/* Message Requests Section */}
        {category === "requests" && (
          <div className="px-4 py-4">
            <h3 className="text-sm font-semibold text-ink mb-3">طلبات المراسلة</h3>
            {requestsLoading ? (
              <div className="space-y-2">
                <ui.Skeleton className="h-24 w-full" />
              </div>
            ) : inboxRequests.length > 0 ? (
              <div className="space-y-2">
                {inboxRequests.map((req: any) => (
                  <div key={req.id} className="bg-paper/30 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
                          {req.sender_id?.slice(0, 2)}
                        </div>
                        <span className="text-sm text-ink truncate">{req.sender_name || "مرسل الطلب"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          req.status === "pending" ? "bg-yellow-500/20 text-yellow-600" :
                          req.status === "accepted" ? "bg-emerald-500/20 text-emerald-600" :
                          req.status === "rejected" ? "bg-red-500/20 text-red-600" :
                          req.status === "canceled" ? "bg-gray-500/20 text-gray-600" :
                          "bg-gray-500/20 text-gray-600"
                        }`}>
                          {req.status === "pending" ? "قيد الانتظار" :
                           req.status === "accepted" ? "مقبول" :
                           req.status === "rejected" ? "مرفوض" :
                           req.status === "canceled" ? "ملغي" : "منتهي"}
                        </span>
                        {req.status === "pending" && (
                          <>
                            <button
                              onClick={async () => {
                                const res = await fetch(`/api/messages/requests/${req.id}/accept`, { method: "POST" });
                                const data = await res.json();
                                if (data.success) {
                                  setInboxRequests(inboxRequests.filter(r => r.id !== req.id));
                                }
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                            >
                              قبول
                            </button>
                            <button
                              onClick={async () => {
                                const res = await fetch(`/api/messages/requests/${req.id}/reject`, { method: "POST" });
                                const data = await res.json();
                                if (data.success) {
                                  setInboxRequests(inboxRequests.filter(r => r.id !== req.id));
                                }
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600"
                            >
                              رفض
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">لا توجد طلبات مراسلة</p>
              </div>
            )}
          </div>
        )}
</div>
        ) : inboxRequests.length > 0 ? (
          <div className="px-4 py-2 border-t border-border/30">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">طلبات الدخول</h3>
            <div className="space-y-2">
              {inboxRequests.map((req: any) => (
                <div key={req.id} className="bg-paper/30 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
                        {req.sender_id?.slice(0, 2)}
                      </div>
                      <span className="text-sm text-ink truncate">مرسل الطلب</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        req.status === "pending" ? "bg-yellow-500/20 text-yellow-600" :
                        req.status === "accepted" ? "bg-emerald-500/20 text-emerald-600" :
                        req.status === "rejected" ? "bg-red-500/20 text-red-600" :
                        req.status === "canceled" ? "bg-gray-500/20 text-gray-600" :
                        "bg-gray-500/20 text-gray-600"
                      }`}>
                        {req.status === "pending" ? "قيد الانتظار" :
                         req.status === "accepted" ? "مقبول" :
                         req.status === "rejected" ? "مرفوض" :
                         req.status === "canceled" ? "ملغي" : "منتهي"}
                      </span>
                      {req.status === "pending" && (
                        <>
                          <button
                            onClick={async () => {
                              setRequestsLoading(true);
                              const res = await fetch(`/api/messages/requests/${req.id}/accept`, { method: "POST" });
                              const data = await res.json();
                              if (data.success) {
                                setInboxRequests(inboxRequests.filter(r => r.id !== req.id));
                              }
                              setRequestsLoading(false);
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                          >
                            قبول
                          </button>
                          <button
                            onClick={async () => {
                              setRequestsLoading(true);
                              const res = await fetch(`/api/messages/requests/${req.id}/reject`, { method: "POST" });
                              const data = await res.json();
                              if (data.success) {
                                setInboxRequests(inboxRequests.filter(r => r.id !== req.id));
                              }
                              setRequestsLoading(false);
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600"
                          >
                            رفض
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="p-4 border-t border-border/30">
          <button
            onClick={() => document.getElementById("message-composer")?.classList.toggle("hidden")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-paper/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white">
              <Send className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-ink">رسالة جديدة</p>
              <p className="text-xs text-slate-400">Ctrl+K للكتابة</p>
            </div>
          </button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center">
            <ui.Card className="max-w-xl w-full p-8">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h1 className="text-2xl font-bold text-ink mb-2">صندوق الرسائل</h1>
                <p className="text-slate-400 mb-4">ربط المتصفح بالتواصل مع الطلاب في مكان واحد</p>
                <Link href="/dashboard"><ui.Button variant="primary">الرئيسية</ui.Button></Link>
              </div>
            </ui.Card>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-paper/30">
                                  <button onClick={() => setSelectedConv(null)} className="p-1 rounded-lg hover:bg-paper/30">
                                    <X className="w-5 h-5 text-slate-400" />
                                  </button>
                                  <h2 className="font-semibold text-ink flex-1 truncate">
                                    {selectedConvData?.title ?? "محادثة"}
                                  </h2>
                                  <ui.Badge variant="info">مفتوح</ui.Badge>
                                  <button className="p-2 rounded-lg hover:bg-paper/30 text-slate-400">
                                    <Paperclip className="w-5 h-5" />
                                  </button>
                                </div>

                                <div id="messages-list" className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: "calc(100vh - 200px)" }}>
                                  {msgLoading ? (
                                    <div className="space-y-3">{[1,2,3,4].map(i => <ui.Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <p className="text-lg font-semibold">لا توجد رسائل</p>
                      <p className="text-sm mt-1">ابدأ المحادثة بإرسال رسالة</p>
                    </div>
                  ) : (
                    messages.map((msg: any) => (
                      <div key={msg.id} className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}>
                                              <ui.Card className="max-w-[70%] rounded-2xl px-4 py-2 shadow-sm">
                                                <div className="text-sm text-ink">{msg.body}</div>
                                                <div className="text-[10px] text-slate-400 mt-1">
                                                  {new Date(msg.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                                                  {!msg.is_deleted && <span className="text-slate-300">•</span>}
                                                  {msg.is_deleted && <span className="text-slate-300">(حذفت)</span>}
                                                </div>
                                              </ui.Card>
                                            </div>
                    ))
                  )}
                </div>

                <form
                  id="message-composer"
                  onSubmit={handleSend}
                  className="border-t border-border/30 p-4 bg-paper/30"
                >
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <textarea
                        id="message-input"
                        placeholder="اكتب رسالتك… (Ctrl+Enter لإرسال)"
                        className="w-full min-h-[50px] max-h-[120px] resize-y p-3 border border-border/30 rounded-xl text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="p-3 rounded-xl border border-border/30 hover:bg-paper/30 cursor-pointer">
                        <Paperclip className="w-5 h-5 text-slate-400" />
                        <input id="file-input" type="file" className="hidden" accept="image/*,.pdf,.txt,.doc,.docx,.mp4" />
                      </label>
                      <ui.Button type="submit" disabled={!draft.trim()} className="bg-amber-500 hover:bg-amber-600 text-white">
                        <Send className="w-4 h-4" />
                      </ui.Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
