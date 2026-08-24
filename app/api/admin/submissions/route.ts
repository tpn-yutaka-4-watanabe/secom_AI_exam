import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listSubmissions } from "@/lib/submission-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json({ error: "管理者認証に失敗しました。" }, { status: 401 });
  }
  return NextResponse.json({ submissions: await listSubmissions() });
}
