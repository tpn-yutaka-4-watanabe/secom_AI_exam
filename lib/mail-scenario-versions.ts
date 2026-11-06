import reference from "./mail-reference-v2.json";
import previousReference from "./mail-reference.json";
import novemberContent from "./mail-content-20261102.json";
import type { EmailScenario } from "./types";

export const MAIL_CONTENT_SUFFIX = "-content-20261106";

// Revise only the known shared wording, preserving administrators' other edits.
export function revisedEmailScenario(scenario: EmailScenario): EmailScenario {
  const note = "※○○○○は自身の所属している事業所です。";
  let situation = scenario.situation.replace(/お客様から(昨日|機能)の対応についてご指摘がありました/g, "お客様から昨日の対応について、電話でご指摘がありました");
  if (/■あなたの役割\r?\n/.test(situation)) {
    situation = situation
      .replace(/※○○○○には自身の所属している事業所名を記入してください。[ \t]*(?:\r?\n)?/g, "")
      .replace(/※○○○○は自身の所属している[「]?事業所です[」]?。?[ \t]*(?:\r?\n)?/g, "")
      .replace(/■あなたの役割\r?\n/, `■あなたの役割\n${note}\n`).trimEnd();
  } else {
    situation = situation.replace("※○○○○には自身の所属している事業所名を記入してください。", note);
  }
  if (situation === scenario.situation) return scenario;
  // A display revision must resolve to the exact same content at submission time.
  const version = scenario.version.endsWith(MAIL_CONTENT_SUFFIX) ? scenario.version : scenario.version + MAIL_CONTENT_SUFFIX;
  return { ...scenario, situation, version };
}

export function currentEmailScenario(saved: EmailScenario | null): EmailScenario {
  if (saved?.rubricVersion === reference.rubricVersion) return revisedEmailScenario(saved);
  return reference.scenarios.find(s => s.id === saved?.id) ?? reference.scenarios[0];
}

export function presetEmailScenario(id: string, version: string): EmailScenario | undefined {
  const all = [...reference.scenarios, ...novemberContent.scenarios, ...previousReference.scenarios];
  const exact = all.find(s => s.id === id && s.version === version);
  if (exact) return exact;
  const revised = version.endsWith(MAIL_CONTENT_SUFFIX);
  const baseVersion = revised ? version.slice(0, -MAIL_CONTENT_SUFFIX.length) : version;
  const preset = all.find(s => s.id === id && s.version === baseVersion);
  return preset && revised ? { ...revisedEmailScenario(preset), version } : preset;
}
