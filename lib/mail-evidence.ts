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
