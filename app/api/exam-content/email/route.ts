import { NextResponse } from "next/server";
import { getEmailExamContent } from "@/lib/exam-settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ receivedEmail: await getEmailExamContent() });
}
