// Fold presentation only: never remove words, change kanji, or fuzzy-match meaning.
const punctuation: Record<string, string> = { "、": ",", "，": ",", "､": ",", "。": ".", "．": ".", "｡": ".", "：": ":", "；": ";", "！": "!", "？": "?" };

function indexedText(value: string) {
  let normalized = "", offset = 0;
  const starts: number[] = [], ends: number[] = [];
  for (const character of value) {
    const end = offset + character.length;
    if (!/\s/u.test(character)) {
      const folded = punctuation[character] ?? character;
      normalized += folded;
      for (let i = 0; i < folded.length; i++) { starts.push(offset); ends.push(end); }
    }
    offset = end;
  }
  return { normalized, starts, ends };
}

export function originalQuote(quote: string, body: string): string | null {
  if (!quote.trim()) return null;
  if (body.includes(quote)) return quote;
  const needle = indexedText(quote).normalized;
  if (!needle) return null;
  const haystack = indexedText(body), index = haystack.normalized.indexOf(needle);
  return index < 0 ? null : body.slice(haystack.starts[index], haystack.ends[index + needle.length - 1]);
}

export function validateMailEvidence(value: unknown, body: string, criterionId: string): string[] {
  const error = () => new Error(`採点項目 ${criterionId} の引用根拠が回答本文にありません。`);
  if (!Array.isArray(value)) throw error();
  return value.flatMap(quote => {
    if (typeof quote !== "string" || !quote.trim()) throw error();
    // Literal delimiters in a real answer are preserved, not interpreted as formatting.
    if (body.includes(quote)) return [quote];
    const parts = quote.includes("】【") ? quote.split("】【") : [quote];
    return parts.map(part => { const original = originalQuote(part, body); if (!original) throw error(); return original; });
  });
}

function selfIntroduction(value: string) {
  const affiliation = /セコム|(?:株式|有限)会社|支社|支店|営業所|事業所|所属/.test(value);
  const nameWithVerb = /(?:の|[ \t　\n]|支社|支店|営業所|事業所|会社)[^\s、,，。]{1,30}(?:と申します|といいます|と言います|でございます|です)(?:[。．.!！]|$)/.test(value);
  return affiliation && nameWithVerb;
}

// A signature cannot be an opening introduction: require a quoted, introducing sentence
// in the opening section, before the main response/closing, not merely company/name lines.
export function hasQuotedOpeningIdentity(body: string, evidence: string[]) {
  const lines: { text: string; start: number; end: number }[] = [];
  for (const match of body.matchAll(/[^\r\n]+/g)) {
    const text = match[0].trim(); if (!text) continue;
    const start = match.index + match[0].indexOf(text);
    lines.push({ text, start, end: start + text.length });
  }
  let limit = Math.min(body.length, 1200);
  for (const line of lines) {
    if (line.start >= limit) break;
    if (/^(?:このたび|この度|まず[、,，\s]|さて[、,，\s]|ご指摘(?:いただいた|の)|何卒|よろしく|敬具|[-―_＝=]{3})/.test(line.text) && !selfIntroduction(line.text)) { limit = line.start; break; }
  }
  const opening = lines.filter(line => line.end <= limit);
  const supports = (start: number, end: number) => evidence.some(quote => {
    let offset = body.indexOf(quote);
    while (offset >= 0) {
      if (offset <= start && offset + quote.length >= end) return true;
      offset = body.indexOf(quote, offset + 1);
    }
    return false;
  });
  const addressee = opening.slice(0, 3).find(line => !/^お客様[\s。]*$/.test(line.text) && /(?:様|さま|御中)$/.test(line.text) && supports(line.start, line.end));
  // A quote may contain only the introduction sentence when a greeting shares its line.
  // Clip broad quotes to the opening so a signature later in the quote cannot satisfy C1.
  const introduction = evidence.some(quote => {
    let offset = body.indexOf(quote);
    while (offset >= 0 && offset < limit) {
      if (addressee && selfIntroduction(body.slice(Math.max(offset, addressee.end), Math.min(offset + quote.length, limit)))) return true;
      offset = body.indexOf(quote, offset + 1);
    }
    return false;
  });
  return Boolean(addressee && introduction);
}
