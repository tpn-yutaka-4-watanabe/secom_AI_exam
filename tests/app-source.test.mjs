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
  assert.match(source, /gradeThreeTimes\(videoPrompt\(record\), `\$\{record\.id\}-video`, "video"\)/);
  assert.match(source, /gradeThreeTimes\(emailPrompt\(record\), `\$\{record\.id\}-email`, "email"\)/);
});

test("video and email are submitted independently", async () => {
  const source = await read("app/api/submissions/route.ts");
  assert.match(source, /examType === "video"/);
  assert.match(source, /examType === "email"/);
  assert.match(source, /record\.videoTest/);
  assert.match(source, /record\.emailTest/);
});

test("video screen has six simple paired rows and locked playback", async () => {
  const source = await read("app/video-test/page.tsx");
  assert.match(source, /initialRowCount = 6/);
  assert.match(source, /不適切だと考える箇所/);
  assert.match(source, /あるべき対応/);
  assert.doesNotMatch(source, /映像時刻|分類|現在時刻|＋ 行を追加/);
  assert.doesNotMatch(source, /\scontrols(?:\s|>|=)/);
  assert.match(source, /onSeeking=\{preventManualSeeking\}/);
  assert.match(source, /\/api\/video-playback/);
});

test("administrator can edit email content and control video playback", async () => {
  const dashboard = await read("app/admin/[accessKey]/AdminDashboard.tsx");
  const route = await read("app/api/admin/exam-settings/route.ts");
  assert.match(dashboard, /メール試験・受信内容を編集/);
  assert.match(dashboard, /全受験者の動画を一斉再生/);
  assert.match(route, /saveEmailExamContent/);
  assert.match(route, /startVideoPlayback/);
  assert.match(route, /resetVideoPlayback/);
});
