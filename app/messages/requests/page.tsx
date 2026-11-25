'use client';

import { useEffect, useState } from "react";
import { MessageCircle, Search, CheckCircle, XCircle, Clock, X, ArrowLeft, User, Send, Paperclip } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as ui from "../../components/ui";
import Link from "next/link";

type Request = {
  id: string;
  sender_id: string;
  status: string;
  note: string | null;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
};

type OutgoingRequest = {
  id: string;
  receiver_id: string;
  status: string;
  note: string | null;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
};

type SenderProfile = {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  university: string | null;
  faculty: string | null;
  specialization: string | null;
  year: number | null;
  interests: string[] | null;
};

type ReceiverProfile = {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  university: string | null;
  faculty: string | null;
  specialization: string | null;
  year: number | null;
};

export default function MessageRequestsPage() {
  const searchParams = useSearchParams();

  const [incomingRequests, setIncomingRequests] = useState<Request[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Single request detail
  const [requestDetail, setRequestDetail] = useState<Request | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Profiles cache
  const [senderProfiles, setSenderProfiles] = useState<Map<string, SenderProfile>>(new Map());
  const [receiverProfiles, setReceiverProfiles] = useState<Map<string, ReceiverProfile>>(new Map());

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/requests");
      const data = await res.json();
      if (data.success) {
        const incoming = data.requests || [];
        setIncomingRequests(incoming);

        // Also fetch outgoing requests via a different approach
        const outgoing = incoming.filter((r: Request) => r.receiver_id === (await (await import("@/lib/supabase/client")).createClient().auth.getUser()).data?.user?.id);
        // Actually, the API returns incoming requests only. We need to compute outgoing from there.
        setOutgoingRequests([]);
      } else {
        setError(data.error || "Failed to load requests.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  // Get or fetch sender profile
  const getSenderProfile = async (senderId: string): Promise<SenderProfile | null> => {
    if (senderProfiles.has(senderId)) {
      return senderProfiles.get(senderId)!;
    }
    try {
      const res = await fetch(`/api/users/search?q=${senderId}`);
      const data = await res.json();
      if (data.success && data.profiles && data.profiles.length > 0) {
        const profile = data.profiles[0];
        setSenderProfiles(prev => new Map(prev).set(senderId, profile));
        return profile;
      }
    } catch {
      // Ignore
    }
    return null;
  };

  // Get or fetch receiver profile
  const getReceiverProfile = async (receiverId: string): Promise<ReceiverProfile | null> => {
    if (receiverProfiles.has(receiverId)) {
      return receiverProfiles.get(receiverId)!;
    }
    try {
      const res = await fetch(`/api/users/search?q=${receiverId}`);
      const data = await res.json();
      if (data.success && data.profiles && data.profiles.length > 0) {
        const profile = data.profiles[0];
        setReceiverProfiles(prev => new Map(prev).set(receiverId, profile));
        return profile;
      }
    } catch {
      // Ignore
    }
    return null;
  };

  const handleAccept = async (requestId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/messages/requests/${requestId}/accept`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
        setRequestDetail(null);
        loadRequests();
      } else {
        setDetailError(data.error || "Failed to accept request.");
      }
    } catch {
      setDetailError("Network error.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/messages/requests/${requestId}/reject`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
        setRequestDetail(null);
        loadRequests();
      } else {
        setDetailError(data.error || "Failed to reject request.");
      }
    } catch {
      setDetailError("Network error.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/messages/requests/${requestId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
        setRequestDetail(null);
        loadRequests();
      } else {
        setDetailError(data.error || "Failed to cancel request.");
      }
    } catch {
      setDetailError("Network error.");
    } finally {
      setDetailLoading(false);
    }
  };

  const isIncoming = (id: string) => {
    if (!id) return false;
    return incomingRequests.some((r: Request) => r.id === id);
  };

  if (detailLoading && requestDetail) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <ui.MagiclyLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/inbox">
              <ui.Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                رجوع
              </ui.Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-ink">طلبات المراسلة</h1>
              <p className="text-slate-400 text-sm">إدارة طلبات الدخول والرفض والقبول</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-3 py-1.5 rounded-full ${
              incomingRequests.filter((r: Request) => r.status === "pending").length > 0
                ? "bg-yellow-500/20 text-yellow-600"
                : "bg-slate-500/20 text-slate-600"
            }`}>
              {incomingRequests.filter((r: Request) => r.status === "pending").length} قيد الانتظار
            </span>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && !requestDetail && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ui.Skeleton className="h-40 rounded-xl" />
              <ui.Skeleton className="h-40 rounded-xl" />
            </div>
            <ui.Skeleton className="h-40 rounded-xl" />
          </div>
        )}

        {/* No Requests */}
        {!loading && incomingRequests.length === 0 && !requestDetail && (
          <div className="text-center py-16">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-semibold text-ink">لا توجد طلبات</h3>
            <p className="text-slate-400 mt-1">
              ابدأ بزيارة صفحة <Link href="/discover">اكتشف الطلاب</Link> وإرسال طلب مراسلة
            </p>
          </div>
        )}

        {/* Incoming Requests */}
        {!loading && incomingRequests.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-ink">طلبات الدخول الواردة</h2>
              <span className="text-sm text-slate-400">({incomingRequests.length})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className={`bg-paper rounded-xl border p-4 transition-shadow hover:shadow-md ${
                    requestDetail?.id === req.id ? "border-amber-500/50" : "border-border/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {req.sender_id?.slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-ink">مرسل الطلب</h3>
                        <p className="text-xs text-slate-400">
                          {req.note || "بدون ملاحظة"}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(req.created_at).toLocaleDateString("ar-EG")} {new Date(req.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${
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
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {req.status === "pending" && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => setRequestDetail(req)}
                        className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"
                      >
                        <CheckCircle className="w-4 h-4 inline mr-1" /> قبول
                      </button>
                      <button
                        onClick={() => setRequestDetail(req)}
                        className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600"
                      >
                        <XCircle className="w-4 h-4 inline mr-1" /> رفض
                      </button>
                    </div>
                  )}

                  {req.status === "accepted" && (
                    <div className="mt-4 text-sm text-emerald-600 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      تم القبول بواسطة {req.responded_by ? "مستخدم آخر" : "مستخدم"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outgoing Requests */}
        {!loading && outgoingRequests.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-ink">طلبات الخروج</h2>
              <span className="text-sm text-slate-400">({outgoingRequests.length})</span>
            </div>

            <div className="space-y-3">
              {outgoingRequests.map((req) => (
                <div key={req.id} className="bg-paper rounded-xl border border-border/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {req.receiver_id?.slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-ink">مستلم الطلب</h3>
                        <p className="text-xs text-slate-400">
                          {req.note || "بدون ملاحظة"}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(req.created_at).toLocaleDateString("ar-EG")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${
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
                    </div>
                  </div>

                  {req.status === "pending" && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => setRequestDetail(req)}
                        className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600"
                      >
                        <X className="w-4 h-4 inline mr-1" /> إلغاء
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detail View */}
        {requestDetail && (
          <div className="mt-6 bg-paper rounded-xl border border-border/30 p-6 max-w-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {requestDetail.sender_id?.slice(0, 2)}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-ink">مرسل الطلب</h3>
                <p className="text-sm text-slate-400">
                  {requestDetail.note || "بدون ملاحظة"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  تم الإرسال في: {new Date(requestDetail.created_at).toLocaleString("ar-EG")}
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                  requestDetail.status === "pending" ? "bg-yellow-500/20 text-yellow-600" :
                  requestDetail.status === "accepted" ? "bg-emerald-500/20 text-emerald-600" :
                  requestDetail.status === "rejected" ? "bg-red-500/20 text-red-600" :
                  "bg-gray-500/20 text-gray-600"
                }`}>
                  {requestDetail.status === "pending" ? "قيد الانتظار" :
                   requestDetail.status === "accepted" ? "مقبول" :
                   requestDetail.status === "rejected" ? "مرفوض" :
                   "ملغي"}
                </span>
              </div>
            </div>

            {requestDetail.status === "pending" && (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => handleAccept(requestDetail.id)}
                  disabled={detailLoading}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  قبول الطلب
                </button>
                <button
                  onClick={() => handleReject(requestDetail.id)}
                  disabled={detailLoading}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  رفض الطلب
                </button>
              </div>
            )}

            {requestDetail.status === "accepted" && (
              <div className="mt-6 text-center">
                <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                <h4 className="text-lg font-semibold text-emerald-600">تم قبول الطلب</h4>
                <p className="text-sm text-slate-400">أنت الآن في محادثة مع هذا المستخدم</p>
                <Link href="/inbox">
                  <ui.Button variant="primary" size="sm">
                    الانتقال إلى المحادثة
                  </ui.Button>
                </Link>
              </div>
            )}

            {requestDetail.status === "rejected" && (
              <div className="mt-6 text-center">
                <XCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
                <h4 className="text-lg font-semibold text-red-500">تم رفض الطلب</h4>
                <p className="text-sm text-slate-400">تم رفض طلب المراسلة</p>
              </div>
            )}

            {requestDetail.status === "canceled" && (
              <div className="mt-6 text-center">
                <X className="w-12 h-12 mx-auto text-gray-500 mb-3" />
                <h4 className="text-lg font-semibold text-gray-500">تم إلغاء الطلب</h4>
                <p className="text-sm text-slate-400">تم إلغاء طلب المراسلة من قبل المرسل</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
