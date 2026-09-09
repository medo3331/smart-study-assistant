// Phase 2.7 — University Academic Library Types
export type ResourceStatus = "draft" | "verified" | "published" | "rejected";
export type ResourceType = "lecture" | "notes" | "textbook" | "syllabus" | "reference" | "external" | "other";
export type SourceType = "official" | "secondary" | "user_submitted";

export interface UniversityResource {
  id: string;
  university_subject_id: string;
  title: string;
  description?: string | null;
  resource_type: ResourceType;
  url?: string | null;
  storage_path?: string | null;
  source_url?: string | null;
  source_type: SourceType;
  language: string;
  academic_year?: string | null;
  status: ResourceStatus;
  created_at: string;
  updated_at: string;
}

export interface ResourceAggregate {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  count: number;
  lastUpdated?: string | null;
}
