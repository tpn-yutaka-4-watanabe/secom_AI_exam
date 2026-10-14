import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all requested exam screens are present", async () => {
  for (const path of ["app/page.tsx", "app/video-test/page.tsx", "app/email-test/page.tsx", "app/complete/page.tsx"]) {
    assert.ok((await read(path)).length > 200, `${path} should contain a screen implementation`);
  }
});

test("BrainAPI request keeps the discovered contract", async () => {
  const source = await read("lib/brain-api.ts");
  for (const field of ["utterance", "projectId", "apiKey", "uid", "stream", "state", "files"]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.match(source, /\/api\/v1\/prediction/);
});

test("each exam is graded three times", async () => {
  const source = await read("lib/brain-api.ts");
  assert.match(source, /attempt <= 3/);
  assert.match(source, /videoPrompt/);
  assert.match(source, /emailPrompt/);
});

test("each exam uses its own BrainAPI project", async () => {
  const source = await read("lib/brain-api.ts");
  assert.match(source, /BRAIN_API_PROJECT_ID_DRIVE/);
  assert.match(source, /BRAIN_API_PROJECT_ID_MAIL/);
  assert.match(source, /gradeThreeTimes\(videoPrompt\(record\), `\$\{record\.id\}-video`, "video", record\)/);
  assert.match(source, /gradeThreeTimes\(emailPrompt\(record\), `\$\{record\.id\}-email`, "email", record\)/);
});

test("video and email are submitted independently", async () => {
  const source = await read("app/api/submissions/route.ts");
  assert.match(source, /examType === "video"/);
  assert.match(source, /examType === "email"/);
  assert.match(source, /record\.videoTest/);
  assert.match(source, /record\.emailTest/);
});

test("video screen has six assessment rows and no embedded playback", async () => {
  const source = await read("app/video-test/page.tsx");
  assert.match(source, /initialRowCount = 6/);
  assert.match(source, /シーン/);
  assert.match(source, /理由・ポイント/);
  assert.match(source, /<option value="○">○/);
  assert.match(source, /<option value="×">×/);
  assert.doesNotMatch(source, /映像時刻|分類|現在時刻|＋ 行を追加/);
  assert.doesNotMatch(source, /\scontrols(?:\s|>|=)/);
  assert.doesNotMatch(source, /<video|\/api\/video-playback|videoEnded/);
});

test("administrator can edit scenarios and export results without video controls", async () => {
  const dashboard = await read("app/admin/[accessKey]/AdminDashboard.tsx");
  const route = await read("app/api/admin/exam-settings/route.ts");
  assert.match(dashboard, /メール試験・状況説明を編集/);
  assert.match(dashboard, /\/api\/admin\/export/);
  assert.match(route, /saveEmailExamContent/);
  assert.doesNotMatch(route, /startVideoPlayback|resetVideoPlayback/);
});

test("both exams always start with empty identity and do not restore drafts", async () => {
  for (const path of ["app/video-test/page.tsx", "app/email-test/page.tsx"]) {
    const source = await read(path);
    assert.match(source, /useState<ExamDraft \| null>\(null\)/);
    assert.doesNotMatch(source, /loadExamDraft|localStorage|sessionStorage/);
    assert.match(source, /event.persisted/);
  }
  assert.match(await read("app/components/ExamStartForm.tsx"), /例：99/);
});
