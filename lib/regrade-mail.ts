import { detectNgWords } from "./ng-words";
import { withGradingSummaries } from "./grading-results";
import type { GradingResult, SubmissionRecord } from "./types";

type Dependencies = {
  load: (id: string) => Promise<SubmissionRecord | null>;
  save: (record: SubmissionRecord) => Promise<void>;
  grade: (record: SubmissionRecord) => Promise<GradingResult>;
};
const inFlight = new Map<string, Promise<SubmissionRecord>>();
export class RegradeBusyError extends Error {}

export function regradeSavedEmail(id: string, dependencies: Dependencies): Promise<SubmissionRecord> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return Promise.reject(new Error("受付番号が不正です。"));
  const existing = inFlight.get(id); if (existing) return existing;
  const work = (async () => {
    const record = await dependencies.load(id);
    if (!record?.emailTest?.scenario) throw new Error("再採点できるメール問題・回答が見つかりません。");
    if (record.gradingState === "grading" && Date.now() - Date.parse(record.gradingStartedAt || "") < 4 * 60_000) throw new RegradeBusyError("採点処理中です。完了後に結果を更新してください。");
    const startedAt = new Date().toISOString();
    const pending: SubmissionRecord = {
      ...record, gradingState: "grading", gradingStartedAt: startedAt,
      emailTest: { ...record.emailTest, ngHits: detectNgWords(record.emailTest.reply.body) },
      previousEmailGradings: [...(record.previousEmailGradings || []), { savedAt: startedAt, grading: record.grading.email, ngHits: record.emailTest.ngHits }],
    };
    // Persist the original grading first, so interrupted retries do not destroy evidence.
    await dependencies.save(pending);
    let email: GradingResult;
    try { email = await dependencies.grade(pending); }
    catch (error) {
      email = { status: "error", attempts: [{ attempt: 1, status: "error", startedAt, completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "再採点に失敗しました。" }] };
    }
    const completed = withGradingSummaries({ ...pending, grading: { ...pending.grading, email }, gradingState: "finished" });
    await dependencies.save(completed);
    return completed;
  })();
  inFlight.set(id, work);
  void work.finally(() => { if (inFlight.get(id) === work) inFlight.delete(id); }).catch(() => {});
  return work;
}
