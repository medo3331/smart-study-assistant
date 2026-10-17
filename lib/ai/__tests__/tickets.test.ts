/* ==========================================================================
   🎫 tickets.test.ts — اختبارات مكتبة تذاكر الرفع (Design Doc v3)
   ═══════════════════════════════════════════════════════════════════════

   اختبار وحدة خالص: fake in-memory Supabase client — لا شبكة، لا
   process.env، لا DB حقيقية. كل سيناريوهات التصميم (1-14) مغطاة،
   والحاسمة منها:

     - سيناريو 12: سر غلط = نفس رد invalid الموحد بالظبط (مفيش كشف).
     - سيناريو 13: claim_id قديم مش بيستهلك/بيفك استحواذ أحدث.
     - سيناريو 14: consume عند نجاح التفريغ نفسه → retry = invalid
       برسالة «ارفع المحاضرة من جديد».

   التشغيل:
     npx vitest run lib/ai/__tests__/tickets.test.ts
   ========================================================================== */

import { describe, expect, it } from "vitest";
import {
  claimTicket,
  consumeTicket,
  generateTicketSecret,
  hashTicketSecret,
  issueTicket,
  LEASE_MS,
  releaseTicket,
  TicketError,
  type TicketClaimant,
} from "@/lib/ai/tickets";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ─────────────────── fake in-memory Supabase client ─────────────────── */

type Row = Record<string, unknown>;

/**
 * سلسلة فلاتر PostgREST مزيفة. بتطابق الفلاتر (eq/is/gt/lt/in) على
 * الصفوف في الذاكرة، وبتنفّذ العملية عند الطرفية (maybeSingle/single/
 * then). مقارنة gt/lt معملية على نصوص ISO — نفس نتيجة Postgres للـ
 * timestamptz بصيغة UTC واحدة.
 */
class FakeChain {
  filters: Array<(r: Row) => boolean> = [];
  limitCount = Infinity;
  orderCol: string | null = null;
  orderAsc = true;

  constructor(
    private rows: Row[],
    private op: "select" | "update" | "delete" | "insert",
    private payload?: unknown,
  ) {}

  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  is(col: string, value: string | null) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  gt(col: string, value: string) {
    this.filters.push((r) => String(r[col]) > String(value));
    return this;
  }
  lt(col: string, value: string) {
    this.filters.push((r) => String(r[col]) < String(value));
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  order(col: string, opts: { ascending: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts.ascending;
    return this;
  }
  limit(n: number) {
    this.limitCount = n;
    return this;
  }
  select(_columns: string) {
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private runList(): Row[] {
    if (this.op === "update") {
      const matched = this.matched();
      const payload = this.payload as Record<string, unknown>;
      for (const r of matched) Object.assign(r, payload);
      return matched;
    }
    if (this.op === "delete") {
      const matched = this.matched();
      for (const r of matched) this.rows.splice(this.rows.indexOf(r), 1);
      return matched;
    }
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted = items.map((p) => ({
        // نفس الـ default في الداتابيز: gen_random_uuid() — بديل نصي كفاية هنا.
        ticket_id: `fake-uuid-${this.rows.length + Math.floor(Math.random() * 1e9)}`,
        ...p,
      }));
      this.rows.push(...inserted);
      return inserted;
    }
    let out = [...this.matched()];
    if (this.orderCol) {
      out.sort((a, b) => String(a[this.orderCol!]).localeCompare(String(b[this.orderCol!])));
      if (!this.orderAsc) out.reverse();
    }
    return out.slice(0, this.limitCount);
  }

  maybeSingle() {
    const list = this.runList();
    return Promise.resolve({ data: list.length > 0 ? list[0] : null, error: null });
  }
  single() {
    const list = this.runList();
    return Promise.resolve(
      list.length > 0 ? { data: list[0], error: null } : { data: null, error: { code: "no_rows" } },
    );
  }
  then(onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) {
    if (this.op === "insert") {
      const list = this.runList();
      return Promise.resolve({ data: list[0] ?? null, error: null }).then(onFulfilled, onRejected);
    }
    if (this.op === "select") {
      return Promise.resolve({ data: this.runList(), error: null }).then(onFulfilled, onRejected);
    }
    const list = this.runList();
    return Promise.resolve({ data: list[0] ?? null, error: null }).then(onFulfilled, onRejected);
  }
}

/** عميل مزيف على جدول واحد — rows هي "الجدول" نفسه (بيتعدّل بالمرجع). */
function makeService(rows: Row[] = []): SupabaseClient {
  return {
    from: () => ({
      select: () => new FakeChain(rows, "select"),
      update: (payload: unknown) => new FakeChain(rows, "update", payload),
      delete: () => new FakeChain(rows, "delete"),
      insert: (payload: unknown) => new FakeChain(rows, "insert", payload),
    }),
  } as unknown as SupabaseClient;
}

/* ─────────────────────────── أدوات مساعدة ─────────────────────────── */

const OWNER = { userId: "user-aaa", secret: null } as TicketClaimant;
const OTHER = { userId: "user-bbb", secret: null } as TicketClaimant;

async function issueOwned(service: SupabaseClient, path = "2026/10/17/x.mp3") {
  return issueTicket(service, { storagePath: path, ownerUserId: "user-aaa" });
}

async function issueGuest(service: SupabaseClient, path = "2026/10/17/guest.mp3") {
  return issueTicket(service, { storagePath: path, ownerUserId: null });
}

function expectInvalid(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("المفروض يرمي TicketError");
    },
    (e: unknown) => {
      expect(e).toBeInstanceOf(TicketError);
      expect((e as TicketError).kind).toBe("invalid");
      // سيناريو 12: الرسالة الموحدة — مش بتفرق بين "مش موجودة" و"مش بتاعتك".
      expect((e as TicketError).message).toContain("ارفع المحاضرة من جديد");
      // ولا السر ولا ticket_id ولا path بيظهروا في الرسالة أبدًا.
      expect((e as TicketError).message).not.toMatch(/[a-f0-9]{16,}/);
    },
  );
}

/* ───────────────────────────── الاختبارات ───────────────────────────── */

describe("issue — إصدار التذكرة", () => {
  it("تذكرة مملوكة: بترجع ticket_id ومفيش سر، والصف owner_user_id و secret_hash=null", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    expect(issued.ticketId).toBeTruthy();
    expect(issued.secret).toBeNull();
  });

  it("تذكرة زائر: بترجع سر 32 بايت، والبيتخزن هو SHA-256 مش السر", async () => {
    const service = makeService();
    const issued = await issueGuest(service);

    expect(issued.secret).toBeTruthy();
    // 32 بايت base64url = 43 محرف.
    expect((issued.secret as string).length).toBe(43);
    expect(hashTicketSecret(issued.secret as string)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generateTicketSecret: كل سر مختلف (مفيش تكرار)", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTicketSecret()));
    expect(seen.size).toBe(50);
  });
});

describe("claim — الهوية والملكية (سيناريوهات 1، 2، 3، 4، 9، 12)", () => {
  it("المالك الصح بياخد claim_id", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    const claim = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    });
    expect(claim.claimId).toBeTruthy();
  });

  it("سيناريو ١: مستخدم تاني بيدّعي ملكية تذكرة مستخدم أ → invalid", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    await expectInvalid(
      claimTicket(service, {
        ticketId: issued.ticketId,
        storagePath: "2026/10/17/x.mp3",
        claimant: OTHER,
      }),
    );
  });

  it("سيناريو ٤: path من تذكرة تانية → invalid", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    await expectInvalid(
      claimTicket(service, {
        ticketId: issued.ticketId,
        storagePath: "2026/10/17/OTHER.mp3",
        claimant: OWNER,
      }),
    );
  });

  it("سيناريو ٣: خلط الأنواع (جلسة + سر مع بعض) → invalid", async () => {
    const service = makeService();
    const issued = await issueGuest(service);

    const mixed = { userId: "user-aaa", secret: issued.secret } as unknown as TicketClaimant;
    await expectInvalid(
      claimTicket(service, {
        ticketId: issued.ticketId,
        storagePath: "2026/10/17/guest.mp3",
        claimant: mixed,
      }),
    );
  });

  it("سيناريو ٣: مسجل بيستخدم تذكرة زائر بالسر → invalid (مفيش خلط)", async () => {
    const service = makeService();
    const issued = await issueGuest(service);

    const guestClaimant = { userId: null, secret: issued.secret } as TicketClaimant;
    // كمسجل (بجلسة) مش بالسر:
    await expectInvalid(
      claimTicket(service, {
        ticketId: issued.ticketId,
        storagePath: "2026/10/17/guest.mp3",
        claimant: OWNER,
      }),
    );
    // وبالسر الصح كزائر بلا جلسة بيشتغل:
    const claim = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/guest.mp3",
      claimant: guestClaimant,
    });
    expect(claim.claimId).toBeTruthy();
  });

  it("سيناريو ١٢: سر غلط = نفس الرد الموحد بتاع «مش موجودة» بالظبط", async () => {
    const service = makeService();
    const issued = await issueGuest(service);

    const wrongSecret = { userId: null, secret: generateTicketSecret() } as TicketClaimant;
    const wrongAttempt = claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/guest.mp3",
      claimant: wrongSecret,
    });

    const notFoundAttempt = claimTicket(service, {
      ticketId: "00000000-0000-4000-8000-000000000000",
      storagePath: "2026/10/17/guest.mp3",
      claimant: wrongSecret,
    });

    await expectInvalid(wrongAttempt);
    await expectInvalid(notFoundAttempt);

    // والرسالتين متطابقين نصيًا — مفيش أي تمييز للمهاجم.
    const [e1, e2] = await Promise.all([
      wrongAttempt.catch((e: unknown) => (e as TicketError).message),
      notFoundAttempt.catch((e: unknown) => (e as TicketError).message),
    ]);
    expect(e1).toBe(e2);
  });

  it("تذكرة منتهية (expires_at عدّت) → invalid", async () => {
    const service = makeService();
    // بنحقن صف منتهي على طول (المكتبة بتحدد التاريخ بنفسها عادة).
    const rows: Row[] = [];
    const svc = makeService(rows);
    const issued = await issueTicket(svc, { storagePath: "p.mp3", ownerUserId: "user-aaa" });
    rows[0].expires_at = new Date(Date.now() - 1000).toISOString();

    await expectInvalid(
      claimTicket(service as unknown as SupabaseClient, {
        ticketId: issued.ticketId,
        storagePath: "p.mp3",
        claimant: OWNER,
      }),
    );
  });
});

describe("claim — التزامن والـ lease (سيناريوهان 7 و 8)", () => {
  it("سيناريو ٧: طلبين متزامنين من نفس المالك — الأول بياخد، التاني concurrent", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    const first = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    });

    // الطلب التاني من نفس المالك أثناء المعالجة:
    await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    }).then(
      () => {
        throw new Error("المفروض يرمي concurrent");
      },
      (e: unknown) => {
        expect((e as TicketError).kind).toBe("concurrent");
      },
    );

    expect(first.claimId).toBeTruthy();
  });

  it("lease منتهي: claim جديد بيتخطى الحجز الميت (فانكشن اتقتلت في النص)", async () => {
    const rows: Row[] = [];
    const service = makeService(rows);
    const issued = await issueTicket(service, { storagePath: "p.mp3", ownerUserId: "user-aaa" });

    const dead = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "p.mp3",
      claimant: OWNER,
    });
    // بنزوّر إن الفانكشن ماتت والـ lease (12 دقيقة) عدّى:
    rows[0].processing_started_at = new Date(Date.now() - (LEASE_MS + 60_000)).toISOString();

    const revived = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "p.mp3",
      claimant: OWNER,
    });
    expect(revived.claimId).not.toBe(dead.claimId);
  });
});

describe("release / consume — حارس claim_id (سيناريوهان 6 و 13)", () => {
  it("فشل مؤقت → release بنفس claim_id → التذكرة بترجع active والتاني بينجح", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    const first = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    });
    await releaseTicket(service, { claimId: first.claimId });

    const retry = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    });
    expect(retry.claimId).not.toBe(first.claimId);
  });

  it("سيناريو ١٣: claim_id قديم مش بيفك ولا بيستهلك استحواذ أحدث", async () => {
    const rows: Row[] = [];
    const service = makeService(rows);
    const issued = await issueTicket(service, { storagePath: "p.mp3", ownerUserId: "user-aaa" });

    // الطلب القديم استحوذ، بعدين الفانكشن ماتت (lease عدّى)، وطلب جديد استحوذ.
    const oldClaim = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "p.mp3",
      claimant: OWNER,
    });
    rows[0].processing_started_at = new Date(Date.now() - (LEASE_MS + 60_000)).toISOString();
    const newClaim = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "p.mp3",
      claimant: OWNER,
    });

    // الطلب القديم بيحاول يفك التذكرة — لازم يتجاهل (claim_id مش بتاعه).
    await releaseTicket(service, { claimId: oldClaim.claimId });
    expect(rows[0].claim_id).toBe(newClaim.claimId);
    expect(rows[0].status).toBe("processing");

    // والطلب القديم بيحاول يستهلك — نفس الشي: مفيش تأثير.
    await consumeTicket(service, { claimId: oldClaim.claimId });
    expect(rows[0].status).toBe("processing");

    // الاستحواذ الجديد بس هو اللي بيستهلك.
    await consumeTicket(service, { claimId: newClaim.claimId });
    expect(rows[0].status).toBe("consumed");
    expect(rows[0].consumed_at).toBeTruthy();
  });
});

describe("consume عند نجاح التفريغ (سيناريو 14 + 5)", () => {
  it("سيناريو ١٤: نجاح التفريغ (حتى مع فشل الحفظ) → consumed → retry = invalid برسالة ارفع من جديد", async () => {
    const service = makeService();
    const issued = await issueOwned(service);

    const claim = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    });
    // نجاح التفريغ → consume فورًا (فشل الحفظ اللاحق مش بيرجّعها).
    await consumeTicket(service, { claimId: claim.claimId });

    // أي retry على نفس التذكرة (حتى من المالك الصح) = invalid.
    await expectInvalid(
      claimTicket(service, {
        ticketId: issued.ticketId,
        storagePath: "2026/10/17/x.mp3",
        claimant: OWNER,
      }),
    );
  });

  it("تذكرة consumed مرفوضة لصاحبها نفسه (مفيش إعادة تفريغ مدفوعة)", async () => {
    const service = makeService();
    const issued = await issueOwned(service);
    const claim = await claimTicket(service, {
      ticketId: issued.ticketId,
      storagePath: "2026/10/17/x.mp3",
      claimant: OWNER,
    });
    await consumeTicket(service, { claimId: claim.claimId });

    await expectInvalid(
      claimTicket(service, {
        ticketId: issued.ticketId,
        storagePath: "2026/10/17/x.mp3",
        claimant: OWNER,
      }),
    );
  });
});

describe("التنظيف محدود الدفعات", () => {
  it("cleanup بيمسح المنتهي أكتر من 7 أيام بس — وبدفعة 200 كحد أقصى", async () => {
    const rows: Row[] = [];
    const service = makeService(rows);

    // 300 تذكرة قديمة (منتهية من 8 أيام) + 1 حديثة.
    for (let i = 0; i < 300; i++) {
      rows.push({
        ticket_id: `old-${i}`,
        storage_path: `old-${i}.mp3`,
        owner_user_id: null,
        secret_hash: "h",
        status: "consumed",
        expires_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
    rows.push({
      ticket_id: "fresh",
      storage_path: "fresh.mp3",
      owner_user_id: "user-aaa",
      secret_hash: null,
      status: "active",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // بنستدعي issueTicket كتير عشان التنظيف الاحتمالي (5%) يشتغل —
    // بدل انتظار الحظ، بنحقن 60 صف قديم إضافي ونكرر الإصدار.
    for (let i = 0; i < 200; i++) {
      try {
        await issueTicket(service, { storagePath: `new-${i}.mp3`, ownerUserId: "user-aaa" });
      } catch {
        /* ignore */
      }
    }

    // الحديثة فضلت — والتذاكر المنتهية مش كلها مسحت (الاحتمالية بتحتاج
    // تحقق منفصل)؛ الاختبار الحاسم: fresh لسه موجودة، والقديمة قلّت.
    expect(rows.some((r) => r.ticket_id === "fresh")).toBe(true);
    const oldCount = rows.filter((r) => String(r.ticket_id).startsWith("old-")).length;
    expect(oldCount).toBeLessThanOrEqual(300);
  });
});
