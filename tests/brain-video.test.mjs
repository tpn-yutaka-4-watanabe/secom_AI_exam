import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("video grading sends scene, judgment and reason to the video project three times", async () => {
  const source = await readFile(new URL("../lib/brain-api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { gradeSubmission } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const keys = ["BRAIN_API_ENDPOINT", "BRAIN_API_KEY", "BRAIN_API_PROJECT_ID_DRIVE", "BRAIN_API_PROJECT_ID_MAIL"];
  const previous = keys.map((key) => process.env[key]);
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    process.env.BRAIN_API_ENDPOINT = "https://brain.example.test";
    process.env.BRAIN_API_KEY = "test-key";
    process.env.BRAIN_API_PROJECT_ID_DRIVE = "video-project";
    process.env.BRAIN_API_PROJECT_ID_MAIL = "mail-project";
    globalThis.fetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ message: '{"base_score":2,"base_max_score":15}' }));
    };
    const finding = { id: "row-1", scene: "歩道を横断", judgment: "×", reason: "歩道の直前で一時停止する" };
    const result = await gradeSubmission({ id: "test", candidateNumber: "TEST", candidateName: "テスト", videoTest: { findings: [finding] } });
    assert.equal(calls.length, 3);
    assert.equal(result.video.status, "completed");
    assert.equal(result.email, undefined);
    assert.equal(new Set(calls.map((call) => call.body.uid)).size, 3);
    for (const call of calls) {
      assert.equal(call.url, "https://brain.example.test/api/v1/prediction");
      assert.equal(call.body.projectId, "video-project");
      assert.match(call.body.utterance, /g4-driving-202611-v1/);
      assert.ok(call.body.utterance.includes(JSON.stringify([finding], null, 2)));
    }
    assert.deepEqual(result.video.attempts[0].response, { message: '{"base_score":2,"base_max_score":15}' });
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
