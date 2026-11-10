import type { SubmissionRecord } from "./types";

const dateFormatter = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

export function submissionDateJst(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = dateFormatter.formatToParts(date);
  const get = (name: string) => parts.find(p => p.type === name)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function submissionDateOptions(records: SubmissionRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) { const date = submissionDateJst(record.submittedAt); if (date) counts.set(date, (counts.get(date) || 0) + 1); }
  return [...counts].sort(([a], [b]) => b.localeCompare(a)).map(([date, count]) => ({ date, count }));
}

export function filterSubmissions(records: SubmissionRecord[], date: string, query: string) {
  const needle = query.trim().toLowerCase();
  return records.filter(record => {
    if (date && submissionDateJst(record.submittedAt) !== date) return false;
    const type = record.videoTest && record.emailTest ? "動画＋メール" : record.examType === "video" || record.videoTest ? "動画" : "メール";
    return !needle || `${record.candidateNumber} ${record.candidateName} ${record.id} ${type}`.toLowerCase().includes(needle);
  });
}
