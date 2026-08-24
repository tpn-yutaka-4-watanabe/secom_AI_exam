import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { gradeSubmission } from "@/lib/brain-api";
import { receivedEmail } from "@/lib/exam-content";
import { saveSubmission } from "@/lib/submission-store";
import type { EmailReply, ExamDraft, SubmissionRecord, VideoFinding } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseFindings(value: unknown): VideoFinding[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    return {
      id: stringValue(entry.id) || randomUUID(),
      time: stringValue(entry.time),
      category: stringValue(entry.category) || "その他",
      issue: stringValue(entry.issue),
      recommendation: stringValue(entry.recommendation),
    };
  }).filter((item) => item.issue && item.recommendation);
}

function parseReply(value: unknown): EmailReply {
  const entry = (value ?? {}) as Record<string, unknown>;
  return {
    to: stringValue(entry.to),
    subject: stringValue(entry.subject),
    body: stringValue(entry.body),
  };
}

function validatePayload(value: unknown): ExamDraft {
  const payload = (value ?? {}) as Record<string, unknown>;
  const candidateNumber = stringValue(payload.candidateNumber);
  const candidateName = stringValue(payload.candidateName);
  const startedAt = stringValue(payload.startedAt) || new Date().toISOString();
  const videoFindings = parseFindings(payload.videoFindings);
  const emailReply = parseReply(payload.emailReply);

  if (!candidateNumber || !candidateName) throw new Error("受験番号と受験者名を入力してください。");
  if (!videoFindings.length) throw new Error("動画試験の回答を1件以上入力してください。");
  if (!emailReply.to || !emailReply.subject || !emailReply.body) throw new Error("メール返信をすべて入力してください。");
  return { candidateNumber, candidateName, startedAt, videoFindings, emailReply };
}

export async function POST(request: Request) {
  try {
    const input = validatePayload(await request.json());
    const submittedAt = new Date().toISOString();
    const record: SubmissionRecord = {
      id: randomUUID(),
      candidateNumber: input.candidateNumber,
      candidateName: input.candidateName,
      startedAt: input.startedAt,
      submittedAt,
      overallStatus: "grading_error",
      videoTest: { videoFile: "training-video.mp4", findings: input.videoFindings },
      emailTest: { receivedEmail, reply: input.emailReply! },
      grading: {
        video: { status: "error", attempts: [] },
        email: { status: "error", attempts: [] },
      },
    };

    await saveSubmission(record);
    record.grading = await gradeSubmission(record);
    record.overallStatus = record.grading.video.status === "completed" && record.grading.email.status === "completed"
      ? "completed"
      : "grading_error";
    await saveSubmission(record);

    return NextResponse.json({
      id: record.id,
      candidateNumber: record.candidateNumber,
      candidateName: record.candidateName,
      submittedAt: record.submittedAt,
      overallStatus: record.overallStatus,
      videoStatus: record.grading.video.status,
      emailStatus: record.grading.email.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "提出処理に失敗しました。" },
      { status: 400 },
    );
  }
}
