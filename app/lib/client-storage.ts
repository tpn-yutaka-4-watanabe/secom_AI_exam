import type { EmailReply, ExamDraft, SubmissionReceipt, VideoFinding } from "@/lib/types";

const draftKey = "grade4-exam-draft";
const receiptKey = "grade4-exam-receipt";

export function loadExamDraft(): ExamDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey);
    return raw ? (JSON.parse(raw) as ExamDraft) : null;
  } catch {
    return null;
  }
}

export function saveExamDraft(draft: ExamDraft) {
  window.localStorage.setItem(draftKey, JSON.stringify(draft));
}

export function updateVideoDraft(findings: VideoFinding[]) {
  const draft = loadExamDraft();
  if (draft) saveExamDraft({ ...draft, videoFindings: findings });
}

export function updateEmailDraft(emailReply: EmailReply) {
  const draft = loadExamDraft();
  if (draft) saveExamDraft({ ...draft, emailReply });
}

export function clearExamDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey);
  window.sessionStorage.removeItem(receiptKey);
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
