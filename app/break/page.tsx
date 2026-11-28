import { redirect } from "next/navigation";

/** Break Zone اندمجت في Magicly Arcade — كل الألعاب في مكان واحد (/games) */
export default function BreakPage() {
  redirect("/games");
}
