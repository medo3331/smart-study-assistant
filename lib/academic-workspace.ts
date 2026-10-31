import type { SupabaseClient } from "@supabase/supabase-js";
import { toDataError, type Result } from "@/lib/pages-data";

export type AcademicStage = "basic" | "secondary" | "university" | "postgraduate";

export interface WorkspaceSubject {
  id: string;
  userId: string;
  name: string;
  stage: AcademicStage;
  curriculum: string | null;
  gradeOrYear: string | null;
  specialization: string | null;
  catalogSubjectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubjectInput {
  name: string;
  stage: AcademicStage;
  curriculum?: string | null;
  gradeOrYear?: string | null;
  specialization?: string | null;
  catalogSubjectId?: string | null;
}

interface SubjectRow {
  id: string;
  user_id: string;
  name: string;
  stage: AcademicStage;
  curriculum: string | null;
  grade_or_year: string | null;
  specialization: string | null;
  catalog_subject_id: string | null;
  created_at: string;
  updated_at: string;
}

function toSubject(row: SubjectRow): WorkspaceSubject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    stage: row.stage,
    curriculum: row.curriculum,
    gradeOrYear: row.grade_or_year,
    specialization: row.specialization,
    catalogSubjectId: row.catalog_subject_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSubjects(
  supabase: SupabaseClient,
  userId: string
): Promise<Result<WorkspaceSubject[]>> {
  const { data, error } = await supabase
    .from("workspace_subjects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: toDataError(error) };
  return { data: ((data ?? []) as SubjectRow[]).map(toSubject), error: null };
}

export async function createSubject(
  supabase: SupabaseClient,
  userId: string,
  input: CreateSubjectInput
): Promise<Result<WorkspaceSubject>> {
  const { data, error } = await supabase
    .from("workspace_subjects")
    .insert({
      user_id: userId,
      name: input.name,
      stage: input.stage,
      curriculum: input.curriculum ?? null,
      grade_or_year: input.gradeOrYear ?? null,
      specialization: input.specialization ?? null,
      catalog_subject_id: input.catalogSubjectId ?? null,
    })
    .select("*")
    .single();
  if (error) return { data: null, error: toDataError(error) };
  return { data: toSubject(data as SubjectRow), error: null };
}

export async function updateSubject(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: Partial<CreateSubjectInput>
): Promise<Result<WorkspaceSubject>> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.stage !== undefined) payload.stage = input.stage;
  if (input.curriculum !== undefined) payload.curriculum = input.curriculum;
  if (input.gradeOrYear !== undefined) payload.grade_or_year = input.gradeOrYear;
  if (input.specialization !== undefined) payload.specialization = input.specialization;
  if (input.catalogSubjectId !== undefined) payload.catalog_subject_id = input.catalogSubjectId;
  const { data, error } = await supabase
    .from("workspace_subjects")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) return { data: null, error: toDataError(error) };
  return { data: toSubject(data as SubjectRow), error: null };
}

export async function deleteSubject(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<Result<null>> {
  const { error } = await supabase
    .from("workspace_subjects")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return { data: null, error: toDataError(error) };
  return { data: null, error: null };
}

export async function fetchSubject(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<Result<WorkspaceSubject>> {
  const { data, error } = await supabase
    .from("workspace_subjects")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { data: null, error: toDataError(error) };
  if (!data) return { data: null, error: { kind: "GENERIC", message: "المادة غير موجودة." } };
  return { data: toSubject(data as SubjectRow), error: null };
}
