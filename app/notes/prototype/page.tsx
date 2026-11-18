import { redirect } from "next/navigation";

/**
 * The Phase 1C prototype route has been promoted to the real notebook UI.
 *
 * `/notes` is the library and `/notes/[notebookId]` is the editor, so this
 * path only survives as a permanent redirect for old links and bookmarks.
 */
export default function NotesPrototypeRedirect(): never {
  redirect("/notes");
}
