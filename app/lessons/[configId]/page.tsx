"use client";

import { useParams } from "next/navigation";
import { CourseLessonsView } from "../components/CourseLessonsView";

export default function CourseLessonsPage() {
  const params = useParams<{ configId?: string | string[] }>();
  const raw = params?.configId;
  const configId = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";

  return <CourseLessonsView configId={configId} />;
}
