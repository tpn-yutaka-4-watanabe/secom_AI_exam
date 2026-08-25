import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  getEmailExamContent,
  getVideoPlaybackState,
  resetVideoPlayback,
  saveEmailExamContent,
  startVideoPlayback,
} from "@/lib/exam-settings-store";
import type { ReceivedEmail } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "管理者認証に失敗しました。" }, { status: 401 });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseReceivedEmail(value: unknown): ReceivedEmail {
  const input = (value ?? {}) as Record<string, unknown>;
  const content = {
    from: text(input.from),
    to: text(input.to),
    date: text(input.date),
    subject: text(input.subject),
    body: text(input.body),
  };
  if (Object.values(content).some((field) => !field)) {
    throw new Error("受信メールのすべての項目を入力してください。");
  }
  return content;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request.headers)) return unauthorized();
  const [receivedEmail, videoPlayback] = await Promise.all([
    getEmailExamContent(),
    getVideoPlaybackState(),
  ]);
  return NextResponse.json({ receivedEmail, videoPlayback });
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request.headers)) return unauthorized();
  try {
    const payload = (await request.json()) as { receivedEmail?: unknown };
    return NextResponse.json({ receivedEmail: await saveEmailExamContent(parseReceivedEmail(payload.receivedEmail)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "メール問題を保存できませんでした。" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request.headers)) return unauthorized();
  try {
    const payload = (await request.json()) as { action?: string };
    if (payload.action === "start") {
      return NextResponse.json({ videoPlayback: await startVideoPlayback() });
    }
    if (payload.action === "reset") {
      return NextResponse.json({ videoPlayback: await resetVideoPlayback() });
    }
    throw new Error("動画操作が正しくありません。");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "動画状態を変更できませんでした。" },
      { status: 400 },
    );
  }
}
