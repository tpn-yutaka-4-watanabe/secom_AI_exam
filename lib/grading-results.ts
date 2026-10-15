import type { BrainAttempt, Evaluation, GradingSummary, SubmissionRecord } from "./types";
import { mailCriteria, MAIL_RUBRIC_VERSION } from "./mail-grading";

type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("採点JSONの形式が正しくありません。");
  return value as Obj;
}
function integer(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) throw new Error("点数が範囲外または数値ではありません。");
  return value;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; }

// Only structured results are scores. Never extract arbitrary numbers from prose.
export function unwrapEvaluation(value: unknown, depth = 0): Obj {
  if (depth > 8) throw new Error("採点JSONが見つかりません。");
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return unwrapEvaluation(JSON.parse(cleaned), depth + 1);
  }
  const obj = object(value);
  if (Array.isArray(obj.criteria)) return obj;
  for (const key of ["message", "content", "text", "output", "response", "answer", "utterance", "data"]) {
    if (obj[key] != null) { try { return unwrapEvaluation(obj[key], depth + 1); } catch { /* try next envelope */ } }
  }
  throw new Error("項目別点数を含む採点JSONがありません。");
}

export function parseEvaluation(value: unknown, exam: "video" | "email", record?: SubmissionRecord, allowLegacy = false): Evaluation {
  const obj = unwrapEvaluation(value);
  const mailVersion = allowLegacy && obj.rubric_version === "g4-mail-20261014-v1" ? "g4-mail-20261014-v1" : MAIL_RUBRIC_VERSION;
  const expected = exam === "email" ? mailCriteria(record?.emailTest?.scenario?.id || "", mailVersion) :
    [1, 1, 2, 1, 2, 1, 2, 2, 2, 1].map((maxScore, i) => ({ id: `R${String(i + 1).padStart(2, "0")}`, maxScore, name: "" }));
  const maxScore = exam === "video" ? 15 : 20;
  const version = exam === "video" ? "g4-driving-202611-v1" : mailVersion;
  if (obj.rubric_version !== version || (obj.max_score ?? obj.base_max_score) !== maxScore) throw new Error("採点基準の版または満点が一致しません。");
  const rawCriteria = obj.criteria as unknown[];
  if (rawCriteria.length !== expected.length) throw new Error("項目別点数が不足または重複しています。");
  const criteria = expected.map(rule => {
    const matches = rawCriteria.map(object).filter(c => (c.id ?? c.criterion_id) === rule.id);
    if (matches.length !== 1) throw new Error(`採点項目 ${rule.id} が不足または重複しています。`);
    const c = matches[0];
    if (c.max_score !== rule.maxScore) throw new Error(`採点項目 ${rule.id} の配点が一致しません。`);
    return { id: rule.id, name: rule.name || text(c.name) || rule.id, maxScore: rule.maxScore, score: integer(c.score, rule.maxScore), comment: text(c.comment) };
  });
  const knownHits = exam === "email" ? record?.emailTest?.ngHits || [] : [];
  const rawDecisions = exam === "email" ? obj.ng_decisions : [];
  if (!Array.isArray(rawDecisions) || rawDecisions.length !== knownHits.length) throw new Error("NG候補の判定が不足しています。");
  const ngDecisions = knownHits.map(hit => {
    const matches = rawDecisions.map(object).filter(d => d.hit_id === hit.id);
    if (matches.length !== 1) throw new Error("NG候補の判定が不足または重複しています。");
    const d = matches[0];
    if (d.decision !== "deduct" && d.decision !== "allow" && d.decision !== "review") throw new Error("NG候補の判定が不正です。");
    return { hitId: hit.id, decision: d.decision as "deduct" | "allow" | "review", comment: text(d.comment) };
  });
  const deductionRules: Record<string, number> = { D1: 3, D2: 2, D3: 2, D4: 1 };
  if (exam === "email" && !Array.isArray(obj.deductions)) throw new Error("減点明細がありません。");
  const deductions = (exam === "email" ? obj.deductions as unknown[] : []).map(raw => {
    const d = object(raw), id = text(d.id), evidence = text(d.evidence), ngHitIds = strings(d.ng_hit_ids);
    if (!deductionRules[id] || d.points !== deductionRules[id]) throw new Error("減点配点が一致しません。");
    if (id !== "D3" && (!evidence.trim() || !record?.emailTest?.reply.body.includes(evidence))) throw new Error("減点根拠が回答本文にありません。");
    if (ngHitIds.some(hitId => !ngDecisions.some(n => n.hitId === hitId && n.decision === "deduct"))) throw new Error("NG判定と減点明細が一致しません。");
    return { id, points: d.points as number, evidence, comment: text(d.comment), ngHitIds };
  });
  for (const d of ngDecisions.filter(d => d.decision === "deduct")) {
    if (deductions.filter(item => item.ngHitIds.includes(d.hitId)).length !== 1) throw new Error("NG候補の減点が欠落または二重計上されています。");
  }
  const keys = deductions.map(d => `${d.id}:${d.evidence}:${d.comment}`);
  if (new Set(keys).size !== keys.length) throw new Error("同一の減点明細が重複しています。");
  const score = Math.max(0, criteria.reduce((sum, c) => sum + c.score, 0) - deductions.reduce((sum, d) => sum + d.points, 0));
  if (integer(obj.score ?? obj.base_score, maxScore) !== score) throw new Error("項目点・減点の合計と総得点が一致しません。");
  const reviewReasons = strings(obj.review_reasons);
  const bonus = obj.bonus && typeof obj.bonus === "object" ? obj.bonus as Obj : null;
  if (bonus?.matched) reviewReasons.push("動画の加点候補あり（配点未確定・通常点には加算していません）");
  return { rubricVersion: version, score, maxScore, criteria, deductions, summary: text(obj.summary),
    needsReview: obj.needs_review === true || obj.status === "needs_review" || reviewReasons.length > 0 || Boolean(bonus?.matched) || ngDecisions.some(d => d.decision === "review"),
    reviewReasons, ngDecisions };
}

export function summarizeAttempts(attempts: BrainAttempt[]): GradingSummary {
  const scores = [1, 2, 3].map(n => {
    const matches = attempts.filter(a => a.attempt === n);
    return matches.length === 1 && matches[0].status === "success" && matches[0].evaluation ? matches[0].evaluation.score : null;
  });
  if (scores.some(s => s === null)) return { scores, score: null, selectedAttempt: null, method: "incomplete", needsReview: true };
  const values = scores as number[];
  const mode = values.find(v => values.filter(n => n === v).length >= 2);
  const score = mode ?? [...values].sort((a, b) => a - b)[1];
  return { scores, score, selectedAttempt: values.indexOf(score) + 1, method: mode === undefined ? "median" : "mode",
    needsReview: attempts.some(a => a.evaluation?.needsReview) };
}

export function withGradingSummaries(record: SubmissionRecord): SubmissionRecord {
  const grading = { ...record.grading };
  for (const exam of ["video", "email"] as const) {
    const group = grading[exam];
    if (!group) continue;
    const attempts = group.attempts.map(a => {
      if (a.status !== "success") return a;
      try { return { ...a, evaluation: parseEvaluation(a.response ?? a.message, exam, record, true), validationError: undefined }; }
      catch (e) { return { ...a, evaluation: undefined, validationError: e instanceof Error ? e.message : "採点形式を確認してください。" }; }
    });
    grading[exam] = { ...group, attempts, summary: summarizeAttempts(attempts) };
  }
  return { ...record, grading };
}
