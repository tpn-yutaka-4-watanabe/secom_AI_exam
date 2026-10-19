import { NextResponse } from "next/server";
import { getBrainConfigurationStatus } from "@/lib/brain-api";
import { storageMode } from "@/lib/submission-store";
import { MAIL_RUBRIC_VERSION } from "@/lib/mail-grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "grade4-certification-exam",
    gradingPolicy: { mailRubricVersion: MAIL_RUBRIC_VERSION, totalSource: "validated-items-minus-deductions" },
    storage: storageMode(),
    brainApi: getBrainConfigurationStatus(),
    timestamp: new Date().toISOString(),
  });
}
