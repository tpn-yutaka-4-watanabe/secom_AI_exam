import type { EmailReply, ExamDraft, ExamType, SubmissionReceipt, VideoFinding } from "@/lib/types";

const draftKeys: Record<ExamType, string> = {
  video: "grade4-video-exam-draft",
  email: "grade4-email-exam-draft",
};
const receiptKey = "grade4-exam-receipt";

export function loadExamDraft(examType: ExamType): ExamDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKeys[examType]);
    const parsed = raw ? (JSON.parse(raw) as ExamDraft) : null;
    return parsed?.examType === examType ? parsed : null;
  } catch {
    return null;
  }
}

export function saveExamDraft(draft: ExamDraft) {
  window.localStorage.setItem(draftKeys[draft.examType], JSON.stringify(draft));
}

export function startExamDraft(examType: ExamType, candidateNumber: string, candidateName: string) {
  const draft: ExamDraft = {
    examType,
    candidateNumber: candidateNumber.trim(),
    candidateName: candidateName.trim(),
    startedAt: new Date().toISOString(),
    videoFindings: [],
    emailReply: null,
  };
  saveExamDraft(draft);
  return draft;
}

export function updateVideoDraft(findings: VideoFinding[]) {
  const draft = loadExamDraft("video");
  if (draft) saveExamDraft({ ...draft, videoFindings: findings });
}

export function updateEmailDraft(emailReply: EmailReply) {
  const draft = loadExamDraft("email");
  if (draft) saveExamDraft({ ...draft, emailReply });
}

export function saveReceivedEmailDraft(receivedEmail: ExamDraft["receivedEmail"]) {
  const draft = loadExamDraft("email");
  if (draft) saveExamDraft({ ...draft, receivedEmail });
}

export function clearExamDraft(examType: ExamType) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKeys[examType]);
}

export function clearExamData(examType: ExamType) {
  clearExamDraft(examType);
  if (typeof window !== "undefined") window.sessionStorage.removeItem(receiptKey);
}

export function saveReceipt(receipt: SubmissionReceipt) {
  window.sessionStorage.setItem(receiptKey, JSON.stringify(receipt));
}

export function loadReceipt(): SubmissionReceipt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(receiptKey);
    return raw ? (JSON.parse(raw) as SubmissionReceipt) : null;
  } catch {
    return null;
  }
}
