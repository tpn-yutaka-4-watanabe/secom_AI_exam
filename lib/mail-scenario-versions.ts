import reference from "./mail-reference-v2.json";
import previousReference from "./mail-reference.json";
import type { EmailScenario } from "./types";

export function currentEmailScenario(saved: EmailScenario | null): EmailScenario {
  if (saved?.rubricVersion === reference.rubricVersion) return saved;
  return reference.scenarios.find(s => s.id === saved?.id) ?? reference.scenarios[0];
}

export function presetEmailScenario(id: string, version: string): EmailScenario | undefined {
  return [...reference.scenarios, ...previousReference.scenarios].find(s => s.id === id && s.version === version);
}
