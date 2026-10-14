import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { emailScenarioOptions, getEmailExamContent, saveEmailExamContent } from "@/lib/exam-settings-store";
import type { EmailScenario } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!isAdminRequest(request.headers)) return NextResponse.json({ error: "管理者認証に失敗しました。" }, { status: 401 });
  return NextResponse.json({ scenario: await getEmailExamContent(), options: emailScenarioOptions() });
}
export async function PUT(request: Request) {
  if (!isAdminRequest(request.headers)) return NextResponse.json({ error: "管理者認証に失敗しました。" }, { status: 401 });
  try {
    const payload = await request.json() as { scenario: EmailScenario };
    return NextResponse.json({ scenario: await saveEmailExamContent(payload.scenario) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした。" }, { status: 400 }); }
}
