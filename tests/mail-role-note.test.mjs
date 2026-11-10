import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const { currentEmailScenario, revisedEmailScenario, placeEmailRoleNote, presetEmailScenario, MAIL_NOTE_SUFFIX } = await loadTs("lib/mail-scenario-versions.ts");
const reference = JSON.parse(await readFile(new URL("../lib/mail-reference-v2.json", import.meta.url), "utf8"));
const note = "※○○○○は自身の所属している事業所です。";
const target = "責任者が不在のため、一次回答をメールで行います。";

test("all three current mail questions put the branch note below the role explanation, once only", () => {
  for (const preset of reference.scenarios) {
    const original = JSON.stringify(preset), current = currentEmailScenario(preset);
    assert.ok(current.situation.startsWith("■あなたの役割\nあなたは"));
    assert.ok(current.situation.includes(`${target}\n${note}\n\n■お客様の希望`));
    assert.equal(current.situation.split(note).length, 2);
    assert.equal(current.situation.replace(note + "\n", ""), preset.situation.replace(note + "\n", ""));
    assert.equal(current.request, preset.request); assert.equal(current.rubricVersion, preset.rubricVersion);
    assert.ok(current.version.endsWith(MAIL_NOTE_SUFFIX));
    assert.deepEqual(revisedEmailScenario(current), current);
    assert.deepEqual(presetEmailScenario(current.id, current.version), current);
    assert.deepEqual(presetEmailScenario(preset.id, preset.version), preset, "in-flight older questions retain the exact original content");
    assert.equal(JSON.stringify(preset), original);
  }
  assert.ok(currentEmailScenario(null).situation.includes(`${target}\n${note}`));
});

test("administrator edits and CRLF survive note placement; missing anchors are not guessed", async () => {
  const original = { ...reference.scenarios[1], version: "11111111-1111-1111-1111-111111111111", title: "独自タイトル", request: "独自の指摘文", situation: reference.scenarios[1].situation.replace("■お客様の希望", "■独自補足\n管理者の追記\n\n■お客様の希望").replaceAll("\n", "\r\n") };
  const before = JSON.stringify(original), revised = currentEmailScenario(original);
  assert.ok(revised.situation.includes(`${target}\n${note}`));
  assert.match(revised.situation, /管理者の追記/);
  assert.equal(revised.title, original.title); assert.equal(revised.request, original.request);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(revisedEmailScenario(revised), revised);
  const custom = { ...original, situation: "■あなたの役割\n独自の状況説明です。\n" + note };
  assert.deepEqual(placeEmailRoleNote(custom), custom);
  const store = await readFile(new URL("../lib/exam-settings-store.ts", import.meta.url), "utf8");
  assert.match(store, /reference.scenarios.map\(revisedEmailScenario\)/);
  assert.match(store, /getSubmittedScenario\(id, version.slice\(0, -MAIL_NOTE_SUFFIX.length\)\)/);
  assert.match(store, /november6EmailScenario\(value\)/);
});
