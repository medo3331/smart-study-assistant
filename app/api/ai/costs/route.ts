import { NextResponse } from "next/server";
import { CREDIT_COSTS } from "@/lib/ai/credit-pricing";

export async function GET() {
  return NextResponse.json({ costs: CREDIT_COSTS });
}