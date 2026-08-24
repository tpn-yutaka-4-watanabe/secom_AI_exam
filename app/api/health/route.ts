import { NextResponse } from "next/server";
import { getBrainConfigurationStatus } from "@/lib/brain-api";
import { storageMode } from "@/lib/submission-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "grade4-certification-exam",
    storage: storageMode(),
    brainApi: getBrainConfigurationStatus(),
    timestamp: new Date().toISOString(),
  });
}
