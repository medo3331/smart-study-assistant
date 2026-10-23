import { NextResponse } from "next/server";

export async function POST(req: Request) {
  console.log("API Chat Route Started - MINIMAL");
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ ok: true, echo: body }, { status: 200 });
  } catch (error: any) {
    console.error("=== FATAL API ERROR ===");
    console.error(error);
    console.error("Message:", error?.message);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unknown server error",
        details: error?.stack || "No stack trace",
      },
      { status: 500 }
    );
  }
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
