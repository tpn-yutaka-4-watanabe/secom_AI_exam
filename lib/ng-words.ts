import reference from "./mail-reference.json";
import type { NgHit } from "./types";

function variants(term: string): string[] {
  if (term.startsWith("○○様")) return ["様でよろしかったでしょうか"];
  if (term === "分かりません（わかりません）") return ["分かりません", "わかりません"];
  return term.split("／");
}

// Candidate extraction only. Context, quotations and the signature exception are judged separately.
export function detectNgWords(body: string): NgHit[] {
  const lines = body.normalize("NFKC").split(/\r?\n/);
  const hits: NgHit[] = [];
  for (const [index, line] of lines.entries()) {
    const candidates: { start: number; end: number; rule: typeof reference.ngWords[number]; term: string }[] = [];
    for (const rule of reference.ngWords) {
      if (rule.category !== "社内用語・機器略称") continue;
      for (const term of variants(rule.term)) {
        const needle = term.normalize("NFKC");
        let start = line.toLowerCase().indexOf(needle.toLowerCase());
        while (start !== -1) {
          const end = start + needle.length;
          const acronym = /^[A-Z]+$/.test(needle);
          if (!acronym || (!/[a-z0-9]/i.test(line[start - 1] || "") && !/[a-z0-9]/i.test(line[end] || ""))) {
            candidates.push({ start, end, rule, term: line.slice(start, end) });
          }
          start = line.toLowerCase().indexOf(needle.toLowerCase(), end);
        }
      }
    }
    const accepted: typeof candidates = [];
    for (const c of candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
      if (accepted.some(a => c.start < a.end && c.end > a.start)) continue;
      accepted.push(c);
    }
    for (const c of accepted.sort((a, b) => a.start - b.start)) {
      hits.push({ id: `hit-${hits.length + 1}`, ruleId: c.rule.id, term: c.term, line: index + 1,
        context: line, signatureCandidate: index >= lines.length - 6 && /セコム|支社|支店|営業所|サブチーフ|BE/i.test(line) && !/[。！？]/.test(line),
        note: c.rule.note });
    }
  }
  return hits;
}
