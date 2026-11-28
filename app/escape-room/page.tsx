import { redirect } from "next/navigation";

/** غرفة الهروب اندمجت في Magicly Arcade — كل الألعاب في مكان واحد (/games) */
export default function EscapeRoomPage() {
  redirect("/games");
}
