import type { ExamDraft, ExamType, SubmissionReceipt } from "@/lib/types";
const receiptKey = "grade4-exam-receipt";
export function startExamDraft(examType: ExamType, candidateNumber: string, candidateName: string): ExamDraft {
  clearExamData(examType);
  return { examType, candidateNumber: candidateNumber.trim(), candidateName: candidateName.trim(),
    startedAt: new Date().toISOString(), videoFindings: [], emailReply: null };
}
export function clearExamData(examType: ExamType) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`grade4-${examType}-exam-draft`);
  window.sessionStorage.removeItem(receiptKey);
}
export function saveReceipt(receipt: SubmissionReceipt) {
  window.sessionStorage.setItem(receiptKey, JSON.stringify(receipt));
}
export function loadReceipt(): SubmissionReceipt | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.sessionStorage.getItem(receiptKey) || "null"); } catch { return null; }
}
