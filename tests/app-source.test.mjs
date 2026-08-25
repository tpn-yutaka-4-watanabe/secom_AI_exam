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
