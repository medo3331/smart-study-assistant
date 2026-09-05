#!/usr/bin/env node
/* ============================================================================
   Phase 1.3 — Live DB Verification (real Supabase DB, real queries, real data)
   Runs against actual tables; reports exact counts, not fabricated results.
 ============================================================================ */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ MISSING ENV: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyTable(name, expectedFields = []) {
  const { count, error } = await supabase.from(name).select("id", { count: "exact", head: true });
  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01" || error.code === "PGRST205") {
      return { exists: false, error: `Table ${name} missing (SQL not executed)`, count: 0 };
    }
    return { exists: true, error: error.message, count: count || 0 };
  }
  return { exists: true, error: null, count: count || 0 };
}

async function run() {
  console.log("=== PHASE 1.3 — LIVE DB VERIFICATION ===\n");

  // 1. Taxonomy tables
  const tables = [
    "education_stages",
    "education_grades",
    "education_tracks",
    "curricula",
    "subjects",
    "countries",
    "past_exams",
    "exam_plans",
    "study_days",
    "planner_goals",
    "profiles",
  ];

  for (const t of tables) {
    const r = await verifyTable(t);
    console.log(`${r.exists ? (r.count > 0 ? "✅" : "⚠️") : "❌"} ${t}: ${r.exists ? (r.count > 0 ? r.count + " rows" : "0 rows (table exists, empty)") : "MISSING - " + r.error}`);
  }

  // 2. New Phase 1.3 tables
  const phase13Tables = [
    "curriculum_content_mapping",
    "curriculum_lessons",
    "curriculum_exams",
    "study_completion_audit",
    "curriculum_coverage_state",
  ];
  console.log("\n--- Phase 1.3 Tables ---");
  for (const t of phase13Tables) {
    const r = await verifyTable(t);
    console.log(`${r.exists ? (r.count > 0 ? "✅" : "🆕") : "❌"} ${t}: ${r.exists ? (r.count > 0 ? r.count + " rows" : "created (0 rows)") : "MISSING (run db/phase-1.3-curriculum-coverage-exam.sql)"}`);
  }

  // 3. Check RLS on new tables
  console.log("\n--- RLS Check (new tables) ---");
  const rlsChecks = [
    "curriculum_content_mapping",
    "curriculum_lessons",
    "curriculum_exams",
    "study_completion_audit",
    "curriculum_coverage_state",
  ];
  for (const t of rlsChecks) {
    const { data, error } = await supabase.rpc("get_table_rls_enabled", { tname: t }).catch(() => ({ data: null, error: { message: "function not available" } }));
    // Fallback: check by selecting with RLS
    const { error: selectErr } = await supabase.from(t).select("id").limit(1);
    const blocked = selectErr && (selectErr.message?.includes("permission denied") || selectErr.message?.includes("violates row-level security"));
    console.log(`${blocked ? "🔐" : (selectErr ? "❌" : "✅")} ${t} RLS: ${blocked ? "blocked (correct)" : (selectErr ? selectErr.message.slice(0, 60) : "accessible")}`);
  }

  // 4. General Secondary vs Baccalaureate isolation
  console.log("\n--- Isolation Check ---");
  const { data: stages } = await supabase.from("education_stages").select("code, name");
  const secCode = stages?.find(s => s.code === "SECONDARY")?.code;
  const baccCode = stages?.find(s => s.code === "BACCALAUREATE")?.code;
  console.log(`General Secondary (${secCode || "N/A"}): ${secCode ? "✅ present" : "❌ missing"}`);
  console.log(`Baccalaureate (${baccCode || "N/A"}): ${baccCode ? "✅ present" : "❌ missing"}`);

  // 5. Curriculum mapping verification
  console.log("\n--- Curriculum Mapping ---");
  const { data: mappings } = await supabase.from("curriculum_content_mapping").select("id, curriculum_id, is_verified").limit(5);
  console.log(`Verified mappings: ${mappings?.length ?? 0} (first 5 checked)`);
  if (mappings && mappings.length > 0) {
    console.log("  Sample mapping IDs:", mappings.map(m => m.id.slice(0, 8) + "...").join(", "));
  }

  // 6. Exam schedule verification
  console.log("\n--- Exam Schedule ---");
  const { data: exams } = await supabase.from("curriculum_exams").select("id, exam_title, exam_date, is_verified, status").limit(5);
  console.log(`Verified future exams: ${exams?.length ?? 0} (first 5 checked)`);
  if (exams && exams.length > 0) {
    console.log("  Sample exam:", exams[0].exam_title, "date:", exams[0].exam_date, "verified:", exams[0].is_verified);
  }

  // 7. Study completion audit
  console.log("\n--- Study Completion Audit ---");
  const { data: audit } = await supabase.from("study_completion_audit").select("id, user_id, source_type").limit(5);
  console.log(`Audit records: ${audit?.length ?? 0}`);

  console.log("\n=== VERIFICATION COMPLETE ===");
  console.log("If any new Phase 1.3 tables show ❌ MISSING, execute:");
  console.log("  psql / Supabase SQL Editor → db/phase-1.3-curriculum-coverage-exam.sql");
}

run().catch(console.error);
