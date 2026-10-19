import { withGradingSummaries } from "./grading-results";
import type { SubmissionRecord } from "./types";

type Cell = string | number | null | { formula: string; value: number | null };
type Sheet = { name: string; rows: Cell[][]; widths: number[] };
function xml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function column(index: number): string {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}
function cell(value: Cell, ref: string, header: boolean): string {
  if (value === null) return `<c r="${ref}"/>`;
  if (typeof value === "number") return `<c r="${ref}" s="2"><v>${value}</v></c>`;
  if (typeof value === "object") return `<c r="${ref}" s="2"${value.value === null ? ' t="str"' : ""}><f>${xml(value.formula)}</f><v>${value.value ?? ""}</v></c>`;
  // Explicit strings prevent spreadsheet formula injection from names and answers.
  return `<c r="${ref}" s="${header ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function sheetXml(sheet: Sheet) {
  const last = `${column(sheet.rows[0].length - 1)}${sheet.rows.length}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${sheet.rows.map((row, i) => `<row r="${i + 1}" ht="${i === 0 ? 32 : Math.min(300, Math.max(30, ...row.map((c, j) => typeof c === "string" ? c.split(/\r?\n/).reduce((n, s) => n + Math.max(1, Math.ceil(s.length * 1.8 / (sheet.widths[j] || 25))), 0) * 16 : 30)))}" customHeight="1">${row.map((v, j) => cell(v, `${column(j)}${i + 1}`, i === 0)).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
// Small, dependency-free ZIP writer for the app's fixed OpenXML export format (stored entries).
function zip(files: [string, string][]) {
  const parts: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [path, content] of files) {
    const name = Buffer.from(path), bytes = Buffer.from(content), crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, name, bytes); directory.push(central, name); offset += local.length + name.length + bytes.length;
  }
  const dir = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

export function resultSheets(records: SubmissionRecord[]): Sheet[] {
  const summary: Sheet = { name: "採点一覧", widths: [38, 12, 20, 12, 10, 10, 10, 12, 14, 12, 65, 50, 24, 14], rows: [["受付番号", "受験番号", "氏名", "試験", "採点1", "採点2", "採点3", "採用点", "採用方式", "コメント採用回", "評価（採用回のみ）", "確認事項", "提出日時（日本時間）", "問題番号"]] };
  const answers: Sheet = { name: "入力内容", widths: [38, 12, 20, 12, 14, 24, 10, 100], rows: [["受付番号", "受験番号", "氏名", "試験", "行・分割番号", "シーン／項目", "○×", "入力内容（原文）"]] };
  const items: Sheet = { name: "項目別点数", widths: [38, 12, 20, 12, 12, 28, 10, 10, 10, 10, 12, 65], rows: [["受付番号", "受験番号", "氏名", "試験", "項目ID", "評価項目", "配点", "採点1", "採点2", "採点3", "採用回の点", "評価（採用回のみ）"]] };
  const deductions: Sheet = { name: "減点・NG確認", widths: [38, 12, 20, 12, 12, 16, 12, 12, 55, 65], rows: [["受付番号", "受験番号", "氏名", "試験", "採用回", "区分／ID", "減点", "行番号", "該当箇所", "評価（採用回のみ）"]] };
  const notes: Sheet = { name: "出力の説明", widths: [30, 110], rows: [["項目", "説明"], ["採用点", "3回の最頻値。同点がなければ中央値。3回の有効な点数が揃わない場合は空欄（要確認）。"], ["コメント・項目別評価", "採用点と同じ得点の最初の回のみを掲載。3回のコメントの混在・平均化はしません。"], ["採点一覧の計算", "採点1～3からExcel数式で採用点を計算します。コメント・採用回・項目点は出力時のスナップショットなので、点数を編集した場合はそれらも確認してください。"], ["動画", "通常点15点満点。配点未確定の加点候補は確認事項とし、通常点に算入しません。"], ["メール", "共通8点＋設問別12点－減点。最低0点。2-1・2-2・2-3に対応。NG文字列は候補抽出後、文脈と署名例外を判定します。"], ["NG候補", "記載されている候補すべてが減点対象とは限りません。採用回の判定を確認してください。"], ["長文", "長い入力・評価は分割行で収録します。受験番号は先頭の0を保持する文字列です。"], ["提出単位", "同じ人の再提出も別の受付番号として全件出力します。管理画面の検索で絞ってから出力できます。"], ["合否", "合否基準は未指定のため自動判定しません。要確認の得点は暫定として扱ってください。"]] };
  for (const raw of records) {
    const record = withGradingSummaries(raw);
    for (const exam of ["video", "email"] as const) {
      if (!record[exam === "video" ? "videoTest" : "emailTest"]) continue;
      const group = record.grading[exam], s = group?.summary;
      const selected = group?.attempts.find(a => a.attempt === s?.selectedAttempt)?.evaluation;
      const prefix: Cell[] = [record.id, record.candidateNumber, record.candidateName, exam === "video" ? "動画" : "メール"];
      const row = summary.rows.length + 1;
      const reasons = [...new Set([...(group?.attempts.flatMap(a => [a.error ? `採点${a.attempt}: 接続エラー` : "", a.validationError ? `採点${a.attempt}: ${a.validationError}` : "", a.evaluation?.needsReview ? `採点${a.attempt}: 要確認` : ""]).filter(Boolean) || []), ...(selected?.reviewReasons || [])])];
      summary.rows.push([...prefix, ...(s?.scores || [null, null, null]), { formula: `IF(COUNT(E${row}:G${row})=3,IFERROR(MODE(E${row}:G${row}),MEDIAN(E${row}:G${row})),"")`, value: s?.score ?? null },
        s?.method === "mode" ? "最頻値" : s?.method === "median" ? "中央値" : "未確定", s?.selectedAttempt ?? null, selected?.summary || "",
        (s?.needsReview ? "要確認。" : "") + reasons.join(" / "), new Date(record.submittedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }), record.emailTest?.scenario?.id && exam === "email" ? record.emailTest.scenario.id : ""]);
      if (exam === "video") record.videoTest?.findings.forEach((f, i) => {
        answers.rows.push([...prefix, i + 1, f.scene ?? f.issue ?? "", f.judgment ?? "旧形式", f.reason ?? f.recommendation ?? ""]);
      });
      else {
        const mail = record.emailTest!;
        const parts = mail.reply.body.split(/(?<=\n)/);
        let number = 1;
        for (const line of parts) for (let i = 0; i < Math.max(1, line.length); i += 500) answers.rows.push([...prefix, number++, "メール本文", "", line.slice(i, i + 500)]);
        if (mail.reply.to) answers.rows.push([...prefix, "旧形式", "宛先", "", mail.reply.to]);
        if (mail.reply.subject) answers.rows.push([...prefix, "旧形式", "件名", "", mail.reply.subject]);
      }
      const exemplar = selected || group?.attempts.find(a => a.evaluation)?.evaluation;
      for (const c of exemplar?.criteria || []) items.rows.push([...prefix, c.id, c.name, c.maxScore, ...[1, 2, 3].map(n => group?.attempts.find(a => a.attempt === n)?.evaluation?.criteria.find(v => v.id === c.id)?.score ?? null), selected?.criteria.find(v => v.id === c.id)?.score ?? null, [selected?.criteria.find(v => v.id === c.id)?.comment || "", ...(selected?.criteria.find(v => v.id === c.id)?.evidence || []).map(q => `引用：${q}`)].join("\n")]);
      for (const d of selected?.deductions || []) deductions.rows.push([...prefix, s?.selectedAttempt ?? null, d.id, d.points, null, d.evidence || (d.id === "D3" ? "該当記述なし（未回答）" : ""), d.comment]);
      if (exam === "email") for (const hit of record.emailTest?.ngHits || []) {
        const decision = selected?.ngDecisions?.find(d => d.hitId === hit.id);
        deductions.rows.push([...prefix, s?.selectedAttempt ?? null, hit.ruleId, null, hit.line, hit.context, decision ? `${decision.decision}: ${decision.comment}` : "採用回未確定"]);
      }
    }
  }
  // Avoid Excel's cell-length and row-height limits without dropping any text.
  for (const sheet of [summary, answers, items, deductions]) {
    sheet.rows = sheet.rows.flatMap((row, index) => {
      if (!index) return [row];
      const count = Math.max(...row.map(c => typeof c === "string" ? Math.ceil(c.length / 500) : 1));
      return Array.from({ length: count }, (_, part) => row.map((c, col) => typeof c === "string" && c.length > 500 ? c.slice(part * 500, (part + 1) * 500) : part && col >= 4 ? null : c));
    });
  }
  // Summary formula references must follow any expanded continuation rows.
  summary.rows.forEach((row, i) => { if (i && typeof row[7] === "object" && row[7]) row[7].formula = `IF(COUNT(E${i + 1}:G${i + 1})=3,IFERROR(MODE(E${i + 1}:G${i + 1}),MEDIAN(E${i + 1}:G${i + 1})),"")`; });
  return [summary, answers, items, deductions, notes];
}

export function exportResults(records: SubmissionRecord[]): Buffer {
  const sheets = resultSheets(records);
  const rel = "http://schemas.openxmlformats.org/package/2006/relationships";
  const officeRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${officeRel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${officeRel}"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships xmlns="${rel}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${officeRel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="${officeRel}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17324D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ]);
}
