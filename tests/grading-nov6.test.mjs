import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {loadTs} from "./load-ts.mjs";

const {parseEvaluation,withGradingSummaries}=await loadTs("lib/grading-results.ts");
const {mailCriteria,mailGradingPrompt,MAIL_RUBRIC_VERSION}=await loadTs("lib/mail-grading.ts");
const {currentEmailScenario,revisedEmailScenario,presetEmailScenario,MAIL_CONTENT_SUFFIX}=await loadTs("lib/mail-scenario-versions.ts");
const {MAIL_DEDUCTION_POINTS,ITEMS_ONLY_RULE,JSON_OUTPUT_RULE,VIDEO_LANGUAGE_RULE}=await loadTs("lib/grading-contract.ts");
const reference=JSON.parse(await readFile(new URL("../lib/mail-reference-v2.json",import.meta.url),"utf8"));

function fixture(){
 const body="納谷様\nセコム原宿支社の河野と申します。\n必ず修繕します。電話に変更します。発報を確認します。";
 const hit={id:"hit-1",term:"発報",context:"発報を確認します。"};
 const record={emailTest:{scenario:reference.scenarios[0],reply:{body},ngHits:[hit]}};
 const result={rubric_version:MAIL_RUBRIC_VERSION,criteria:mailCriteria("2-1").map(c=>({id:c.id,max_score:c.maxScore,score:c.maxScore,evidence:[body],comment:"形式・計算検証用"})),
  deductions:[{id:"D1",evidence:"必ず修繕します。",comment:"未確認の確約"},{id:"D2",evidence:"電話に変更します。",comment:"メール希望の無視"},{id:"D3",evidence:"",comment:"主要指摘への未回答"},{id:"D4",evidence:"発報",comment:"社内用語",ng_hit_ids:["hit-1"]}],
  ng_decisions:[{hit_id:"hit-1",decision:"deduct",comment:"本文の社内用語"}],summary:"評価"};
 return {record,result};
}

test("all deduction values come from app rule IDs, without model totals or points",()=>{
 const {record,result}=fixture();
 const parsed=parseEvaluation(result,"email",record);
 assert.equal(parsed.score,12);
 assert.deepEqual(parsed.deductions.map(d=>d.points),[3,2,2,1]);
 for(const wrong of [-99,0,999,"計算できません",null]){
  const bad={...result,score:wrong,base_score:wrong,total_score:wrong,max_score:wrong,base_max_score:wrong,deduction_total:wrong,deductions:result.deductions.map(d=>({...d,points:wrong,total:wrong}))};
  assert.equal(parseEvaluation(bad,"email",record).score,12);
 }
 const historical={...record,grading:{email:{attempts:[1,2,3].map(attempt=>({attempt,status:"success",response:{...result,score:999,deductions:result.deductions.map(d=>({...d,points:999}))}}))}}};
 assert.equal(withGradingSummaries(historical).grading.email.summary.score,12);
 assert.deepEqual(Object.values(MAIL_DEDUCTION_POINTS),[3,2,2,1]);
 const over={...result,deductions:[...result.deductions,{id:"D1",evidence:"必ず修繕します。",comment:"別件の形式検証"},{id:"D1",evidence:"必ず修繕します。",comment:"別件2"}]};
 const zeros={...over,criteria:result.criteria.map(c=>({...c,score:0}))};
 assert.equal(parseEvaluation(zeros,"email",record).score,0);
});

test("removing model deduction arithmetic keeps invalid IDs, fabricated evidence and duplicates rejected",()=>{
 const {record,result}=fixture();
 for(const id of ["D5","toString","__proto__",""]){
  assert.throws(()=>parseEvaluation({...result,deductions:[{...result.deductions[0],id}]},"email",record));
 }
 assert.throws(()=>parseEvaluation({...result,deductions:[...result.deductions,result.deductions[0]]},"email",record));
 assert.throws(()=>parseEvaluation({...result,deductions:result.deductions.map(d=>({...d,evidence:"本文にない文章"}))},"email",record));
 assert.throws(()=>parseEvaluation({...result,criteria:result.criteria.map(c=>({...c,score:-1}))},"email",record));
});

test("all mail problems use telephone complaints and place the revised branch note under the role heading",()=>{
 const note="※○○○○は自身の所属している事業所です。";
 for(const scenario of reference.scenarios){
  assert.ok(scenario.situation.startsWith("■あなたの役割\n"+note+"\n"));
  assert.match(scenario.situation,/電話でご指摘がありました/);
  assert.equal(scenario.situation.split(note).length,2);
  assert.doesNotMatch(scenario.situation,/事業所名を記入してください/);
  const original=presetEmailScenario(scenario.id,MAIL_RUBRIC_VERSION);
  assert.doesNotMatch(original.situation,/電話でご指摘/);
  assert.match(original.situation,/事業所名を記入してください/);
 }
 const saved={...reference.scenarios[1],title:"管理者の独自タイトル",request:"独自の指摘文",version:"11111111-1111-1111-1111-111111111111",situation:"■あなたの役割\nあなたは○○○○で勤務しています。本日、お客様から昨日の対応についてご指摘がありました。\n\n■独自の補足\n管理者の追記\n※○○○○には自身の所属している事業所名を記入してください。"};
 const original=JSON.stringify(saved),migrated=currentEmailScenario(saved);
 assert.equal(migrated.version,saved.version+MAIL_CONTENT_SUFFIX);
 assert.equal(migrated.title,saved.title);assert.equal(migrated.request,saved.request);
 assert.ok(migrated.situation.includes("管理者の追記"));
 assert.match(migrated.situation,/電話でご指摘/);
 assert.equal(JSON.stringify(saved),original);
 assert.deepEqual(revisedEmailScenario(migrated),migrated);
 const resolved=presetEmailScenario("2-1",MAIL_RUBRIC_VERSION+MAIL_CONTENT_SUFFIX);
 assert.equal(resolved.version,MAIL_RUBRIC_VERSION+MAIL_CONTENT_SUFFIX);
 assert.match(resolved.situation,/電話でご指摘/);
 const windows={...saved,situation:saved.situation.replaceAll("\n","\r\n")};
 assert.ok(revisedEmailScenario(windows).situation.startsWith("■あなたの役割\n"+note+"\n"));
});

test("mail prompt requires both addressee and self-introduction, emits item scores only, and preserves candidate braces",()=>{
 const body='納谷様 {原文} ｛引用は直さない｝';
 const prompt=mailGradingPrompt(reference.scenarios[0],body,[]);
 assert.ok(prompt.includes(ITEMS_ONLY_RULE));assert.ok(prompt.includes(JSON_OUTPUT_RULE));
 assert.match(prompt,/宛名だけ・名乗りだけ・どちらもなしは必ず0点/);
 const exampleLine=prompt.split("\n").find(line=>line.startsWith('｛"rubric_version"'));
 const example=JSON.parse(exampleLine.replaceAll("｛","{").replaceAll("｝","}"));
 assert.equal(example.max_score,undefined);assert.equal(example.score,undefined);
 assert.deepEqual(example.deductions,[]);assert.equal(example.criteria.length,12);
 assert.equal(JSON.parse(prompt.split("\n").at(-1)).answer,body);
});

test("copy-paste prompts use only fullwidth braces and instruct valid JSON output without totals",async()=>{
 for(const path of ["docs/BRAIN_MAIL_GRADING_PROMPT.txt","docs/BRAIN_VIDEO_GRADING_PROMPT.md"]){
  const doc=await readFile(new URL("../"+path,import.meta.url),"utf8");
  assert.doesNotMatch(doc,/[{}]/);assert.ok(doc.includes(JSON_OUTPUT_RULE));
 }
 const mail=await readFile(new URL("../docs/BRAIN_MAIL_GRADING_PROMPT.txt",import.meta.url),"utf8");
 assert.doesNotMatch(mail,/"points"\s*:/);
 const video=await readFile(new URL("../docs/BRAIN_VIDEO_GRADING_PROMPT.md",import.meta.url),"utf8");
 assert.ok(video.includes(VIDEO_LANGUAGE_RULE));
 assert.doesNotMatch(video,/"(?:base_score|final_score|bonus_points)"\s*:/);
});

test("mail start notice is hidden, only the body label remains, and drive answer area is consistently named",async()=>{
 const start=await readFile(new URL("../app/components/ExamStartForm.tsx",import.meta.url),"utf8");
 assert.match(start,/examType === "video" && <div className="single-exam-notice"/);
 const mail=await readFile(new URL("../app/email-test/page.tsx",import.meta.url),"utf8");
 assert.match(mail,/<span>本文<\/span>/);assert.doesNotMatch(mail,/宛名・挨拶・署名も本文に含めてください/);
 assert.match(mail,/回答内容を確認しました/); // This is submission confirmation, not the removed pre-exam notice.
 const drive=await readFile(new URL("../app/video-test/page.tsx",import.meta.url),"utf8");
 assert.match(drive,/採点する回答は回答欄に記入してください/);
 assert.match(drive,/<span>回答欄<\/span>/);assert.doesNotMatch(drive,/回答表|回答票|シーンごとの評価/);
});
