import type { BrainAttempt, Evaluation, GradingSummary, SubmissionRecord } from "./types";
import { mailCriteria, MAIL_RUBRIC_VERSION, MAIL_PREVIOUS_VERSIONS, scenarioRubricVersion } from "./mail-grading";
import { MAIL_DEDUCTION_POINTS } from "./grading-contract";
import { originalQuote, validateMailEvidence, hasQuotedOpeningIdentity } from "./mail-evidence";

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
  const responseVersion = text(obj.rubric_version);
  const isPrevious = MAIL_PREVIOUS_VERSIONS.some(v => v === responseVersion);
  const mailVersion = isPrevious && (allowLegacy || responseVersion !== "g4-mail-20261014-v1") ? responseVersion : MAIL_RUBRIC_VERSION;
  const scenario = record?.emailTest?.scenario;
  if (exam === "email" && scenario && (scenario.rubricVersion || (!allowLegacy && scenario.version)) && responseVersion !== scenarioRubricVersion(scenario)) {
    throw new Error("出題時の採点基準とBrainAPI応答の版が一致しません。メール用プロンプトの設定を確認してください。");
  }
  const expected = exam === "email" ? mailCriteria(record?.emailTest?.scenario?.id || "", mailVersion) :
    [1, 1, 2, 1, 2, 1, 2, 2, 2, 1].map((maxScore, i) => ({ id: `R${String(i + 1).padStart(2, "0")}`, maxScore, name: "" }));
  const maxScore = exam === "video" ? 15 : 20;
  const version = exam === "video" ? "g4-driving-202611-v1" : mailVersion;
  // The rubric, not any model-reported aggregate or overall maximum, fixes the cap.
  if (obj.rubric_version !== version) throw new Error("採点基準の版が一致しません。");
  const rawCriteria = obj.criteria as unknown[];
  const body = record?.emailTest?.reply.body || "";
  const processingNotes: string[] = [];
  if (rawCriteria.length !== expected.length) throw new Error("項目別点数が不足または重複しています。");
  const criteria = expected.map(rule => {
    const matches = rawCriteria.map(object).filter(c => (c.id ?? c.criterion_id) === rule.id);
    if (matches.length !== 1) throw new Error(`採点項目 ${rule.id} が不足または重複しています。`);
    const c = matches[0];
    if (c.max_score !== rule.maxScore) throw new Error(`採点項目 ${rule.id} の配点が一致しません。`);
    let score = integer(c.score, rule.maxScore);
    let comment = text(c.comment);
    let evidence: string[] | undefined;
    if (exam === "email" && (version === MAIL_RUBRIC_VERSION || version === "g4-mail-20261019-v1" || c.evidence !== undefined)) {
      evidence = validateMailEvidence(c.evidence, body, rule.id);
      if (JSON.stringify(evidence) !== JSON.stringify(c.evidence)) processingNotes.push(`${rule.id}：引用の句読点・空白・連結形式を照合し、回答本文の原文へ復元しました。`);
      if (score > 0 && !evidence.length) throw new Error(`採点項目 ${rule.id} の加点根拠がありません。`);
      if (!text(c.comment).trim()) throw new Error(`採点項目 ${rule.id} の判定理由がありません。`);
    }
    if (exam === "email" && version === MAIL_RUBRIC_VERSION && rule.id === "C1" && score > 0 && !hasQuotedOpeningIdentity(body, evidence || [])) {
      score = 0;
      const correction = "C1：宛名と本文冒頭の所属・氏名の名乗りを両方裏付ける引用がないため0点。末尾の署名はC6で評価します。";
      comment += `\n【アプリ補正】${correction}`;
      processingNotes.push(correction);
    }
    return { id: rule.id, name: rule.name || text(c.name) || rule.id, maxScore: rule.maxScore, score, comment, evidence };
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
  if (exam === "email" && !Array.isArray(obj.deductions)) throw new Error("減点明細がありません。");
  const deductions = (exam === "email" ? obj.deductions as unknown[] : []).flatMap(raw => {
    const d = object(raw), id = text(d.id), ngHitIds = strings(d.ng_hit_ids);
    if (!Object.hasOwn(MAIL_DEDUCTION_POINTS, id)) throw new Error("減点の種類が不正です。");
    // NG decisions are authoritative even if an older prompt grouped, omitted or repeated IDs.
    const ngSurface = id === "D4" && knownHits.some(hit => {
      const normalized = text(d.evidence).normalize("NFKC").toLowerCase(), term = hit.term.normalize("NFKC").toLowerCase();
      return /^[a-z]+$/.test(term) ? new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, "i").test(normalized) : normalized.includes(term);
    });
    if (id === "D4" && (ngHitIds.length > 0 || ngSurface)) return [];
    if (ngHitIds.length) throw new Error("NG由来の減点はng_decisionsだけで判定してください。");
    const rawEvidence = text(d.evidence), evidence = id === "D3" ? rawEvidence : originalQuote(rawEvidence, body);
    if (evidence === null) throw new Error("減点根拠が回答本文にありません。");
    // Ignore model-reported points and every subtotal, including in older responses.
    return [{ id, points: MAIL_DEDUCTION_POINTS[id], evidence, comment: text(d.comment), ngHitIds: [] as string[] }];
  });
  for (const decision of ngDecisions.filter(d => d.decision === "deduct")) {
    const hit = knownHits.find(h => h.id === decision.hitId)!;
    const line = body.split(/\r?\n/)[hit.line - 1];
    const term = hit.term.normalize("NFKC").toLowerCase();
    const evidence = line && line.normalize("NFKC").toLowerCase().includes(term) ? line : originalQuote(text(hit.context), body) || originalQuote(hit.term, body);
    if (!evidence) throw new Error("NG候補の原文を確認できません。");
    deductions.push({ id: "D4", points: 1, evidence, comment: `NG語「${hit.term}」：${decision.comment}`, ngHitIds: [hit.id] });
  }
  const keys = deductions.map(d => `${d.id}:${d.evidence}:${d.comment}:${d.ngHitIds.join(",")}`);
  if (new Set(keys).size !== keys.length) throw new Error("同一の減点明細が重複しています。");
  const score = Math.max(0, criteria.reduce((sum, c) => sum + c.score, 0) - deductions.reduce((sum, d) => sum + d.points, 0));
  // Model-reported totals (score/base_score) are ignored; validated line items are authoritative.
  const reviewReasons = strings(obj.review_reasons);
  if (exam === "email" && (version === "g4-mail-20261014-v1" || version === "g4-mail-20261015-v1")) reviewReasons.push("旧形式の採点結果：項目別引用根拠の検証は未保証。新プロンプトへの更新を確認してください。");
  const bonus = obj.bonus && typeof obj.bonus === "object" ? obj.bonus as Obj : null;
  if (exam === "video" && bonus?.matched) reviewReasons.push("動画の加点候補あり（配点未確定・通常点には加算していません）");
  return { rubricVersion: version, score, maxScore, criteria, deductions, summary: text(obj.summary),
    needsReview: obj.needs_review === true || obj.status === "needs_review" || reviewReasons.length > 0 || Boolean(bonus?.matched) || ngDecisions.some(d => d.decision === "review"),
    reviewReasons, ngDecisions, processingNotes };
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
  const groups = [...(record.videoTest ? [grading.video] : []), ...(record.emailTest ? [grading.email] : [])];
  const complete = groups.length > 0 && groups.every(group => group?.summary?.score != null);
  return { ...record, grading, overallStatus: complete ? "completed" : "grading_error" };
}
