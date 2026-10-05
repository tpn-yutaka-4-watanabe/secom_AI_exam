import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { gradeSubmission } from "@/lib/brain-api";
import { saveSubmission } from "@/lib/submission-store";
import type {
  EmailReply,
  ExamType,
  ReceivedEmail,
  SubmissionRecord,
  VideoFinding,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ValidSubmission = {
  examType: ExamType;
  candidateNumber: string;
  candidateName: string;
  startedAt: string;
  videoFindings: VideoFinding[];
  emailReply: EmailReply | null;
  receivedEmail: ReceivedEmail | null;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseFindings(value: unknown): VideoFinding[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    return {
      id: stringValue(entry.id) || randomUUID(),
      scene: stringValue(entry.scene),
      judgment: stringValue(entry.judgment),
      reason: stringValue(entry.reason),
    };
  }).filter((item) => item.scene || item.judgment || item.reason).map((item) => {
    if (!item.scene || !item.reason || (item.judgment !== "○" && item.judgment !== "×")) {
      throw new Error("記入した行はシーン・○×・理由／ポイントをすべて入力してください。");
    }
    return { ...item, judgment: item.judgment as "○" | "×" };
  });
}

function parseReply(value: unknown): EmailReply {
  const entry = (value ?? {}) as Record<string, unknown>;
  return {
    to: stringValue(entry.to),
    subject: stringValue(entry.subject),
    body: stringValue(entry.body),
  };
}

function parseReceivedEmail(value: unknown): ReceivedEmail {
  const entry = (value ?? {}) as Record<string, unknown>;
  return {
    from: stringValue(entry.from),
    to: stringValue(entry.to),
    date: stringValue(entry.date),
    subject: stringValue(entry.subject),
    body: stringValue(entry.body),
  };
}

function validatePayload(value: unknown): ValidSubmission {
  const payload = (value ?? {}) as Record<string, unknown>;
  const examType = payload.examType === "video" || payload.examType === "email"
    ? payload.examType
    : null;
  const candidateNumber = stringValue(payload.candidateNumber);
  const candidateName = stringValue(payload.candidateName);
  const startedAt = stringValue(payload.startedAt) || new Date().toISOString();

  if (!examType) throw new Error("試験種別が正しくありません。");
  if (!candidateNumber || !candidateName) throw new Error("受験番号と受験者名を入力してください。");

  if (examType === "video") {
    const videoFindings = parseFindings(payload.videoFindings);
    if (!videoFindings.length) throw new Error("動画試験の回答を1件以上入力してください。");
    return {
      examType,
      candidateNumber,
      candidateName,
      startedAt,
      videoFindings,
      emailReply: null,
      receivedEmail: null,
    };
  }

  const emailReply = parseReply(payload.emailReply);
  const receivedEmail = parseReceivedEmail(payload.receivedEmail);
  if (!emailReply.to || !emailReply.subject || !emailReply.body) {
    throw new Error("メール返信をすべて入力してください。");
  }
  if (Object.values(receivedEmail).some((field) => !field)) {
    throw new Error("受信メールの内容を確認できません。画面を再読み込みしてください。");
  }
  return {
    examType,
    candidateNumber,
    candidateName,
    startedAt,
    videoFindings: [],
    emailReply,
    receivedEmail,
  };
}

export async function POST(request: Request) {
  try {
    const input = validatePayload(await request.json());
    const submittedAt = new Date().toISOString();
    const record: SubmissionRecord = {
      id: randomUUID(),
      examType: input.examType,
      candidateNumber: input.candidateNumber,
      candidateName: input.candidateName,
      startedAt: input.startedAt,
      submittedAt,
      overallStatus: "grading_error",
      grading: {},
    };

    if (input.examType === "video") {
      record.videoTest = { videoFile: "training-video.mp4", findings: input.videoFindings };
      record.grading.video = { status: "error", attempts: [] };
    } else {
      record.emailTest = { receivedEmail: input.receivedEmail!, reply: input.emailReply! };
      record.grading.email = { status: "error", attempts: [] };
    }

    await saveSubmission(record);
    record.grading = await gradeSubmission(record);
    const gradingStatus = input.examType === "video" ? record.grading.video?.status : record.grading.email?.status;
    record.overallStatus = gradingStatus === "completed" ? "completed" : "grading_error";
    await saveSubmission(record);

    return NextResponse.json({
      id: record.id,
      examType: input.examType,
      candidateNumber: record.candidateNumber,
      candidateName: record.candidateName,
      submittedAt: record.submittedAt,
      overallStatus: record.overallStatus,
      gradingStatus: gradingStatus ?? "error",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "提出処理に失敗しました。" },
      { status: 400 },
    );
  }
}
