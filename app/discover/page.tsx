'use client';

import { useEffect, useState } from "react";
import { Search, User, MessageCircle, X, Mail, ExternalLink } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as ui from "../../components/ui";
import Link from "next/link";

type Profile = {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  university: string | null;
  faculty: string | null;
  specialization: string | null;
  year: number | null;
  interests: string[] | null;
  bio: string | null;
  is_visible: boolean;
  match_score: number;
};

type SearchState = "idle" | "loading" | "error";

export default function DiscoverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState<SearchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Pre-fill query from URL if present
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      // Start searching after a small delay
      const timer = setTimeout(() => searchProfiles(q), 300);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const searchProfiles = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    setLoading("loading");
    setError(null);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success) {
        setResults(data.profiles || []);
      } else {
        setError(data.error || "Search failed.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading("idle");
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setResults([]);
    if (q.length >= 2) {
      searchProfiles(q);
    } else {
      setResults([]);
    }
  };

  const handleSendRequest = async (profile: Profile) => {
    setSelectedProfile(null);
    setSendingRequest(profile.profile_id);
    try {
      const res = await fetch("/api/messages/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_profile_id: profile.profile_id, note: "مراسلة جديد" }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(results.filter(r => r.profile_id !== profile.profile_id));
        // Refresh incoming requests
        const reqRes = await fetch("/api/messages/requests");
        const reqData = await reqRes.json();
        if (reqData.success) {
          setRequests(reqData.requests || []);
        }
      } else {
        alert("Failed: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("Network error.");
    } finally {
      setSendingRequest(null);
    }
  };

  const loadIncomingRequests = async () => {
    try {
      const res = await fetch("/api/messages/requests");
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadIncomingRequests();
  }, []);

  return (
    <div className="min-h-screen bg-paper" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">اكتشف الطلاب</h1>
            <p className="text-slate-400 mt-1">اعرض الملفات العامة وابدأ محادثة مع زملائك</p>
          </div>
          <Link href="/inbox">
            <ui.Button variant="ghost">
              <MessageCircle className="w-4 h-4" />
              الرسائل
            </ui.Button>
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <ui.Input
              placeholder="ابحث بالاسم أو الجامعة أو التخصص… (اكتب على الأقل حرفان)"
              value={query}
              onChange={handleSearch}
              className="pl-10"
            />
          </div>
          {query.length > 0 && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              className="text-xs text-slate-400 hover:text-ink mt-2 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> مسح البحث
            </button>
          )}
        </div>

        {/* Results */}
        {loading === "loading" && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <ui.Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {loading === "error" && (
          <div className="text-center py-8 text-red-500">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {query.length >= 2 && loading === "idle" && results.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">لا توجد نتائج مطابقة</p>
          </div>
        )}

        {/* Profile List */}
        {results.length > 0 && (
          <div className="space-y-3">
            {/* Incoming Requests Sidebar */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
              <div className="md:col-span-1 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">طلبات الدخول القادمة</h3>
                {requests.length === 0 ? (
                  <p className="text-sm text-slate-400">لا ت Exist طلبات واردة</p>
                ) : (
                  <div className="space-y-2">
                    {requests.map((req: any) => (
                      <div key={req.id} className="bg-paper/30 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
                              {req.sender_id?.slice(0, 2)}
                            </div>
                            <span className="text-sm text-ink truncate">مرسل الطلب</span>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-600">
                            قيد الانتظار
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Profile Cards */}
              <div className="space-y-3">
                {results.map((profile) => (
                  <div
                    key={profile.profile_id}
                    className={`bg-paper rounded-xl border p-4 transition-shadow hover:shadow-md ${
                      selectedProfile?.profile_id === profile.profile_id ? "border-amber-500/50" : "border-border/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                          {profile.display_name?.charAt(0) || "?"}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-ink truncate">{profile.display_name}</h3>
                          <p className="text-xs text-slate-400 truncate">{profile.university || "—"}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedProfile(profile);
                          router.push(`/messages/requests?profile_id=${profile.profile_id}&action=send`);
                        }}
                        className="p-2 rounded-lg border border-border/30 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 transition-colors"
                        title="إرسال طلب مراسلة"
                      >
                        <MessageCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {profile.specialization && (
                      <p className="text-xs text-slate-400 mt-2">التخصص: {profile.specialization}</p>
                    )}
                    {profile.faculty && (
                      <p className="text-xs text-slate-400">الكلية: {profile.faculty}</p>
                    )}
                    {profile.year && (
                      <p className="text-xs text-slate-400">السنة: {profile.year}</p>
                    )}
                    {profile.interests && profile.interests.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {profile.interests.slice(0, 3).map((interest) => (
                          <span key={interest} className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
                            {interest}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Send Request State */}
        {selectedProfile && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
            <div className="bg-paper rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white text-lg font-bold">
                  {selectedProfile.display_name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-ink">{selectedProfile.display_name}</h3>
                  <p className="text-xs text-slate-400">{selectedProfile.university}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                هل تريد إرسال طلب مراسلة إلى {selectedProfile.display_name}؟
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    handleSendRequest(selectedProfile.profile_id);
                    setSelectedProfile(null);
                  }}
                  disabled={sendingRequest === selectedProfile.profile_id}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50"
                >
                  {sendingRequest === selectedProfile.profile_id ? "إرسال..." : "إرسال الطلب"}
                </button>
                <button
                  onClick={() => setSelectedProfile(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border/30 text-ink hover:bg-paper/50"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
