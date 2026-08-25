import { NextResponse } from "next/server";
import { getVideoPlaybackState } from "@/lib/exam-settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getVideoPlaybackState(), {
    headers: { "Cache-Control": "no-store" },
  });
}
