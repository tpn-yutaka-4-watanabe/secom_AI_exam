import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const { parseEvaluation, withGradingSummaries } = await loadTs("lib/grading-results.ts");
const { mailCriteria, mailGradingPrompt, MAIL_RUBRIC_VERSION } = await loadTs("lib/mail-grading.ts");
const { detectNgWords } = await loadTs("lib/ng-words.ts");
const { originalQuote, validateMailEvidence } = await loadTs("lib/mail-evidence.ts");
const { submissionDateJst, submissionDateOptions, filterSubmissions } = await loadTs("lib/submission-dates.ts");
const { regradeSavedEmail } = await loadTs("lib/regrade-mail.ts");
const { gradeSubmission, gradeEmailSubmission } = await loadTs("lib/brain-api.ts");
const { resultSheets } = await loadTs("lib/results-xlsx.ts");
const { ITEMS_ONLY_RULE, NG_DECISION_RULE } = await loadTs("lib/grading-contract.ts");
const reference = JSON.parse(await readFile(new URL("../lib/mail-reference-v2.json", import.meta.url), "utf8"));
const introduction = "セコム原宿支社の河野と申します。";
const signature = "セコム株式会社　原宿支社\n河野　裕樹";
const defaultBody = `納谷様\n${introduction}\n\nこのたびはご不便をお掛けして申し訳ございません。\n確認のうえ改めて回答いたします。\n何卒よろしくお願い申し上げます。\n${signature}`;
function fixture(body = defaultBody, id = "2-1") {
  const record = { id: "nov10-test", candidateNumber: "99", candidateName: "検証", submittedAt: "2026-11-09T15:00:00Z", examType: "email",
    emailTest: { scenario: reference.scenarios.find(s => s.id === id), reply: { body }, ngHits: detectNgWords(body) }, grading: {} };
  const response = { rubric_version: MAIL_RUBRIC_VERSION, criteria: mailCriteria(id).map(c => ({ id: c.id, max_score: c.maxScore, score: c.maxScore, evidence: [body], comment: "形式・処理テスト用（内容採点ではない）" })),
    deductions: [], ng_decisions: record.emailTest.ngHits.map(h => ({ hit_id: h.id, decision: h.signatureCandidate ? "allow" : "deduct", comment: "文脈検証用" })), summary: "形式検証", needs_review: false, review_reasons: [] };
  return { record, response };
}
const group = response => ({ status: "completed", attempts: [1, 2, 3].map(attempt => ({ attempt, status: "success", response })) });

test("three NG words in one sentence deduct three points independently of all old grouped deductions", () => {
  const body = `${defaultBody}\nBE、MGT、PISを確認します。\nサブチーフBE 河野`;
  const { record, response } = fixture(body);
  // Simulate the exact reported model judgments; do not use extraction's hint as the decision.
  response.ng_decisions = record.emailTest.ngHits.map((h, i) => ({ hit_id: h.id, decision: i === 3 ? "allow" : "deduct", comment: "本文／署名" }));
  assert.equal(record.emailTest.ngHits.length, 4);
  const raw = { id: "D4", points: 1, evidence: "BE、MGT、PISを確認します。", comment: "一文にまとめられた旧NG減点" };
  const variants = [[], [{ ...raw, ng_hit_ids: ["hit-1"] }], [{ ...raw, ng_hit_ids: ["hit-1", "hit-2", "hit-3"] }], [raw], [raw, raw], [{ ...raw, evidence: "誤った旧NG引用", ng_hit_ids: ["hit-1"] }]];
  for (const deductions of variants) {
    const rawResponse = { ...response, score: 999, deduction_total: -999, deductions };
    const original = JSON.stringify(rawResponse);
    const parsed = parseEvaluation(rawResponse, "email", record);
    assert.equal(parsed.score, 17);
    assert.deepEqual(parsed.deductions.map(d => d.ngHitIds), [["hit-1"], ["hit-2"], ["hit-3"]]);
    assert.deepEqual(parsed.deductions.map(d => d.points), [1, 1, 1]);
    assert.equal(JSON.stringify(rawResponse), original);
    const restored = withGradingSummaries({ ...record, grading: { email: group(rawResponse) }, overallStatus: "grading_error" });
    assert.equal(restored.grading.email.summary.score, 17);
    assert.equal(restored.overallStatus, "completed");
  }
  const sheets = resultSheets([{ ...record, grading: { email: group(response) } }]);
  assert.deepEqual(sheets[0].rows[1].slice(4, 7), [17, 17, 17]);
  assert.equal(sheets[0].rows[1][7].value, 17);
  assert.equal(sheets[3].rows.filter(row => row[5] === "D4" && row[6] === 1).length, 3);
  response.deductions = [{ id: "D4", evidence: "確認のうえ", comment: "独立した非NGの形式検証", ng_hit_ids: [] }];
  assert.equal(parseEvaluation(response, "email", record).score, 16);
  assert.throws(() => parseEvaluation({ ...response, ng_decisions: response.ng_decisions.slice(1) }, "email", record));
  assert.throws(() => parseEvaluation({ ...response, ng_decisions: response.ng_decisions.map(d => ({ ...d, hit_id: "hit-1" })) }, "email", record));
});

test("fullwidth NG terms restore their real answer lines and allowed/review terms are not deducted", () => {
  const { record, response } = fixture(`${defaultBody}\nＢＥ、ＭＧＴ、ＰＩＳを確認します。`);
  response.ng_decisions.forEach(d => { d.decision = "deduct"; });
  let parsed = parseEvaluation(response, "email", record);
  assert.equal(parsed.score, 17);
  assert.ok(parsed.deductions.every(d => d.evidence === "ＢＥ、ＭＧＴ、ＰＩＳを確認します。"));
  response.ng_decisions[0].decision = "allow";
  response.ng_decisions[1].decision = "review";
  parsed = parseEvaluation(response, "email", record);
  assert.equal(parsed.score, 19); assert.equal(parsed.needsReview, true);
});

test("C1 uses the model's item score without app-level wording or position rescoring", () => {
  for (const [address, intro, modelScore] of [[true, true, 1], [false, true, 0], [true, false, 0], [false, false, 0]]) {
    const body = `${address ? "納谷様\n" : ""}${intro ? introduction + "\n" : ""}このたびは申し訳ございません。\n確認して回答いたします。\n何卒よろしくお願い申し上げます。\n${signature}`;
    const { record, response } = fixture(body);
    const c1 = response.criteria.find(c => c.id === "C1");
    c1.score = modelScore;
    c1.evidence = [...(address ? ["納谷様"] : []), intro ? introduction : signature];
    const parsed = parseEvaluation(response, "email", record);
    assert.equal(parsed.score, 19 + modelScore, `address=${address}, intro=${intro}`);
    assert.equal(parsed.criteria.find(c => c.id === "C1").score, modelScore);
    assert.equal(parsed.criteria.find(c => c.id === "C6").score, 1);
    assert.ok(!parsed.processingNotes.some(n => n.startsWith("C1")));
  }
  const { record, response } = fixture();
  response.criteria.find(c => c.id === "C1").evidence = ["納谷様", signature];
  assert.equal(parseEvaluation(response, "email", record).score, 20, "valid quoted text is not semantically regraded by the app; signature exclusion is the model's rubric rule");
  response.criteria.find(c => c.id === "C1").score = 0;
  assert.equal(parseEvaluation(response, "email", record).score, 19, "the app also never upgrades a model zero");
});

test("C1 accepts the reported greeting-before-introduction and has no line, length or fixed phrase constraints", () => {
  const address = "納谷　大将　様", intro = "セコム（株）システム業務部の河野と申します。";
  const bodies = [
    `${address}\n\nこの度は弊社サービスをご導入いただきありがとうございます。\n${intro}\n\n確認して回答いたします。`,
    `件名：ご回答\n株式会社顧客\n代表取締役\n${address}\n${intro}`,
    `${address}\n${"ご挨拶申し上げます。\n".repeat(150)}${intro}`,
    `${address}\n所属：セコム（株）システム業務部\n河野であります。`,
  ];
  for (const body of bodies) {
    const { record, response } = fixture(body);
    const c1 = response.criteria.find(c => c.id === "C1");
    c1.evidence = [address, body.includes(intro) ? intro : "所属：セコム（株）システム業務部\n河野であります。"];
    const parsed = parseEvaluation(response, "email", record);
    assert.equal(parsed.criteria.find(c => c.id === "C1").score, 1);
    assert.equal(parsed.score, 20);
    assert.doesNotMatch(parsed.criteria.find(c => c.id === "C1").comment, /アプリ補正/);
  }
});

test("saved responses and Excel recover C1 without AI resubmission or mutations, while evidence and score guards remain", async () => {
  const body = "納谷　大将　様\nこの度は弊社サービスをご導入いただきありがとうございます。\nセコム（株）システム業務部の河野と申します。";
  const { record, response } = fixture(body);
  record.grading.email = group(response);
  record.grading.email.attempts.forEach(a => { a.evaluation = { score: 19, criteria: [{ id: "C1", score: 0, comment: "【アプリ補正】旧結果" }] }; });
  const original = JSON.stringify(record), restored = withGradingSummaries(record);
  assert.deepEqual(restored.grading.email.summary.scores, [20, 20, 20]);
  assert.ok(restored.grading.email.attempts.every(a => a.evaluation.criteria.find(c => c.id === "C1").score === 1));
  const sheets = resultSheets([record]);
  assert.deepEqual(sheets[0].rows[1].slice(4, 7), [20, 20, 20]);
  assert.equal(sheets[0].rows[1][7].value, 20);
  assert.doesNotMatch(JSON.stringify(sheets), /アプリ補正/);
  assert.equal(JSON.stringify(record), original);
  for (const score of [-1, 2, "1"]) {
    const invalid = structuredClone(response); invalid.criteria.find(c => c.id === "C1").score = score;
    assert.throws(() => parseEvaluation(invalid, "email", record));
  }
  for (const evidence of [[], ["存在しない根拠"]]) {
    const invalid = structuredClone(response); invalid.criteria.find(c => c.id === "C1").evidence = evidence;
    assert.throws(() => parseEvaluation(invalid, "email", record));
  }
  const parser = await readFile(new URL("../lib/grading-results.ts", import.meta.url), "utf8");
  const evidence = await readFile(new URL("../lib/mail-evidence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(parser + evidence, /hasQuotedOpeningIdentity|selfIntroduction|slice\(0, 3\)|1200|【アプリ補正】/);
});

test("punctuation, whitespace and joined quotes are restored to exact original text without fuzzy words", () => {
  const body = "まず、猫を飼われていることを伺っておりました。\r\n今後は　安全に配慮します！\n確認して回答します。";
  assert.equal(originalQuote("まず,猫を飼われていることを伺っておりました.", body), "まず、猫を飼われていることを伺っておりました。");
  assert.equal(originalQuote("今後は安全に配慮します!", body), "今後は　安全に配慮します！");
  assert.deepEqual(validateMailEvidence(["まず,猫を飼われていることを伺っておりました. 】【今後は安全に配慮します!"], body, "S2"), body.split(/\r?\n/).slice(0, 2));
  assert.equal(originalQuote("猫を飼われていることを伺っておりませんでした。", body), null);
  assert.equal(originalQuote("まず、犬を飼われていることを伺っておりました。", body), null);
  assert.throws(() => validateMailEvidence(["まず、猫…確認して回答します。"], body, "S2"));
  assert.throws(() => validateMailEvidence(["確認して回答します。】【"], body, "S2"));
  assert.deepEqual(validateMailEvidence(["A】【B"], "A】【B", "C3"), ["A】【B"]);
  for (const id of ["2-1", "2-2", "2-3"]) {
    const { record, response } = fixture(`${defaultBody}\n${body}`, id);
    const item = response.criteria.find(c => c.id === "S2");
    item.evidence = ["まず,猫を飼われていることを伺っておりました."];
    const original = JSON.stringify(response);
    const parsed = parseEvaluation(response, "email", record);
    assert.equal(parsed.score, 20); assert.equal(parsed.criteria.find(c => c.id === "S2").evidence[0], body.split("\r\n")[0]);
    assert.ok(parsed.processingNotes.some(n => n.startsWith("S2")));
    assert.equal(JSON.stringify(response), original);
  }
});

test("history filter uses Japanese calendar dates and combines date and search for export selection", () => {
  assert.equal(submissionDateJst("2026-11-09T14:59:59Z"), "2026-11-09");
  assert.equal(submissionDateJst("2026-11-09T15:00:00Z"), "2026-11-10");
  assert.equal(submissionDateJst("invalid"), "");
  const base = fixture().record;
  const records = [{ ...base, id: "old", submittedAt: "2026-11-09T14:59:59Z" }, { ...base, id: "new", candidateName: "山田", submittedAt: "2026-11-09T15:00:00Z" }, { ...base, id: "new2", submittedAt: "2026-11-10T14:59:59Z" }];
  assert.deepEqual(submissionDateOptions(records), [{ date: "2026-11-10", count: 2 }, { date: "2026-11-09", count: 1 }]);
  assert.deepEqual(filterSubmissions(records, "2026-11-10", "").map(r => r.id), ["new", "new2"]);
  assert.deepEqual(filterSubmissions(records, "2026-11-10", "山田").map(r => r.id), ["new"]);
  assert.equal(filterSubmissions(records, "2026-11-11", "").length, 0);
  assert.equal(filterSubmissions(records, "", " メール ").length, 3);
});

async function mockBrain(run) {
  const keys = ["BRAIN_API_ENDPOINT", "BRAIN_API_KEY", "BRAIN_API_PROJECT_ID_MAIL"];
  const saved = keys.map(k => process.env[k]), original = globalThis.fetch;
  process.env.BRAIN_API_ENDPOINT = "https://brain.invalid.test";
  process.env.BRAIN_API_KEY = "test-key"; process.env.BRAIN_API_PROJECT_ID_MAIL = "test-mail-project";
  try { await run(); }
  finally { globalThis.fetch = original; keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
}

test("unusable email round alone is retried; retries remain three logical votes with separate raw history", async () => {
  await mockBrain(async () => {
    const { record, response } = fixture(), calls = [];
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(init.body); calls.push(request);
      const slot = Number(request.uid.match(/-email-(\d)/)[1]);
      const value = structuredClone(response);
      if (slot === 2) value.criteria[1].score--;
      return new Response(JSON.stringify({ message: slot === 1 && !request.uid.includes("retry") ? "採点JSONになっていない返答" : JSON.stringify(value) }));
    };
    const { email } = await gradeSubmission(record);
    assert.equal(calls.length, 4); assert.equal(new Set(calls.map(c => c.uid)).size, 4);
    assert.deepEqual(email.summary.scores, [20, 19, 20]); assert.equal(email.summary.score, 20);
    assert.equal(email.attempts.length, 3); assert.equal(email.attempts[0].retryHistory.length, 2);
    assert.match(email.attempts[0].retryHistory[0].validationError, /JSON/);
    assert.ok(email.attempts[0].retryHistory[1].evaluation); assert.equal(email.attempts[1].retryHistory, undefined);
  });
});

test("needs_review, fabricated quotes and transient HTTP failures trigger bounded affected-round retries", async () => {
  await mockBrain(async () => {
    const { record, response } = fixture();
    for (const kind of ["review", "quote", "http"]) {
      const counts = new Map();
      globalThis.fetch = async (_url, init) => {
        const uid = JSON.parse(init.body).uid, slot = uid.match(/-email-(\d)/)[1];
        const count = (counts.get(slot) || 0) + 1; counts.set(slot, count);
        const value = structuredClone(response);
        if (slot === "1" && count === 1) {
          if (kind === "review") { value.needs_review = true; value.review_reasons = ["要確認"]; }
          if (kind === "quote") value.criteria[2].evidence = ["本文にない架空の根拠"];
          if (kind === "http") return new Response("temporarily unavailable", { status: 503 });
        }
        return new Response(JSON.stringify(value));
      };
      const { email } = await gradeSubmission(record);
      assert.equal(email.summary.score, 20); assert.equal(email.summary.needsReview, false);
      assert.deepEqual([...counts.values()].sort(), [1, 1, 2]);
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("invalid response"); };
    let result = await gradeSubmission(record);
    assert.equal(calls, 9); assert.equal(result.email.attempts.length, 3);
    assert.equal(result.email.summary.score, null); assert.equal(result.email.status, "error");
    assert.ok(result.email.attempts.every(a => a.retryHistory.length === 3));
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("unauthorized", { status: 401 }); };
    result = await gradeSubmission(record);
    assert.equal(calls, 3); assert.equal(result.email.summary.score, null);
    calls = 0; delete process.env.BRAIN_API_KEY;
    result = await gradeSubmission(record);
    assert.equal(calls, 0); assert.ok(result.email.attempts.every(a => !a.retryHistory));
  });
});

test("exhausted retries preserve an earlier parseable provisional result instead of replacing it with broken output", async () => {
  await mockBrain(async () => {
    const { record, response } = fixture(); let calls = 0;
    globalThis.fetch = async (_url, init) => {
      const uid = JSON.parse(init.body).uid; calls++;
      return new Response(uid.includes("retry") ? "bad JSON" : JSON.stringify({ ...response, needs_review: true, review_reasons: ["内容要確認"] }));
    };
    const email = await gradeEmailSubmission(record);
    assert.equal(calls, 9); assert.equal(email.summary.score, 20); assert.equal(email.summary.needsReview, true);
    assert.ok(email.attempts.every(a => a.retryHistory.length === 3 && a.evaluation.needsReview));
  });
});

test("manual email regrading snapshots original raw grades, leaves video/date intact and single-flights duplicate requests", async () => {
  const { record, response } = fixture();
  record.videoTest = { findings: [] }; record.grading.video = { status: "error", attempts: [] };
  record.grading.email = group({ broken: "old raw" });
  const original = JSON.stringify(record), saves = []; let calls = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const deps = { load: async () => record, save: async r => { saves.push(structuredClone(r)); }, grade: async () => { calls++; await wait; return group(response); } };
  const first = regradeSavedEmail(record.id, deps), second = regradeSavedEmail(record.id, deps);
  assert.equal(first, second); release();
  const completed = await first;
  assert.equal(calls, 1); assert.equal(saves.length, 2); assert.equal(saves[0].gradingState, "grading");
  assert.equal(completed.gradingState, "finished"); assert.equal(completed.submittedAt, record.submittedAt);
  assert.deepEqual(completed.grading.video.attempts, record.grading.video.attempts);
  assert.equal(completed.grading.email.summary.score, 20);
  assert.deepEqual(completed.previousEmailGradings[0].grading, record.grading.email);
  assert.equal(JSON.stringify(record), original);
});

test("manual regrading persists failures, rejects active/invalid/missing records, and never invents successful empty grades", async () => {
  const { record } = fixture(); const saves = [];
  const failed = await regradeSavedEmail("failure-test", { load: async () => record, save: async r => saves.push(r), grade: async () => { throw new Error("connection failed"); } });
  assert.equal(failed.overallStatus, "grading_error"); assert.equal(failed.gradingState, "finished");
  assert.equal(failed.grading.email.summary.score, null); assert.equal(saves.length, 2);
  const deps = { load: async () => ({ ...record, gradingState: "grading", gradingStartedAt: new Date().toISOString() }), save: async () => assert.fail("must not save"), grade: async () => assert.fail("must not grade") };
  await assert.rejects(regradeSavedEmail("busy-test", deps), /処理中/);
  await assert.rejects(regradeSavedEmail("../escape", deps), /不正/);
  await assert.rejects(regradeSavedEmail("missing-test", { ...deps, load: async () => null }), /見つかりません/);
  assert.equal(withGradingSummaries(record).overallStatus, "grading_error");
});

test("runtime and fullwidth copy-paste prompts share NG contract and explicit opening-only C1 rules", async () => {
  const { record } = fixture(), prompt = mailGradingPrompt(record.emailTest.scenario, record.emailTest.reply.body, []);
  const doc = await readFile(new URL("../docs/BRAIN_MAIL_GRADING_PROMPT.txt", import.meta.url), "utf8");
  for (const rule of [ITEMS_ONLY_RULE, NG_DECISION_RULE]) { assert.ok(prompt.includes(rule)); assert.ok(doc.includes(rule)); }
  assert.match(prompt, /末尾の署名は名乗りとして扱わず/); assert.doesNotMatch(doc, /[{}]/);
  assert.doesNotMatch(doc, /deduct候補はdeductions.ng_hit_idsのちょうど1件/);
  const admin = await readFile(new URL("../app/admin/[accessKey]/AdminDashboard.tsx", import.meta.url), "utf8");
  assert.match(admin, /提出日（日本時間）/); assert.match(admin, /ids: filtered.map/); assert.match(admin, /自動再試行の履歴/);
  const route = await readFile(new URL("../app/api/admin/regrade-email/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("isAdminRequest(request.headers)") < route.indexOf("await request.json()"));
  assert.match(route, /status: 401/); assert.doesNotMatch(route, /export async function GET/);
  const get = await readFile(new URL("../app/api/admin/submissions/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(get, /gradeSubmission|gradeEmailSubmission|regradeSavedEmail/);
});
