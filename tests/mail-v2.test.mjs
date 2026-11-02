import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const { mailCriteria, mailGradingPrompt, MAIL_RUBRIC_VERSION, scenarioRubricVersion } = await loadTs("lib/mail-grading.ts");
const { parseEvaluation, withGradingSummaries } = await loadTs("lib/grading-results.ts");
const { resultSheets } = await loadTs("lib/results-xlsx.ts");
const { currentEmailScenario, presetEmailScenario } = await loadTs("lib/mail-scenario-versions.ts");
const { gradeSubmission } = await loadTs("lib/brain-api.ts");
const reference = JSON.parse(await readFile(new URL("../lib/mail-reference-v2.json",import.meta.url),"utf8"));

function fixture(id, bonus = 1) {
  const body = "確認して改めてご回答いたします。";
  const record = {id:`mail-v2-${id}`,candidateNumber:"0099",candidateName:"検証",submittedAt:"2026-11-02T00:00:00Z",emailTest:{scenario:reference.scenarios.find(s=>s.id===id),reply:{body},ngHits:[]}};
  const response = {rubric_version:MAIL_RUBRIC_VERSION,max_score:20,score:999,criteria:mailCriteria(id).map(c=>({id:c.id,max_score:c.maxScore,score:c.id.startsWith("B") ? bonus : c.maxScore,evidence:c.id.startsWith("B") && !bonus ? [] : [body],comment:"検証用の形式・数値"})),deductions:[],ng_decisions:[],summary:"形式検証"};
  return {record,response};
}

for (const id of ["2-1","2-2","2-3"]) test(`v2 ${id}: restored first item, 10+8+2 points, bonus capped, deductions and versions validated`, () => {
  const rules=mailCriteria(id);
  assert.deepEqual(["C","S","B"].map(prefix=>rules.filter(c=>c.id.startsWith(prefix)).reduce((n,c)=>n+c.maxScore,0)),[10,8,2]);
  assert.deepEqual(rules.map(c=>c.id),["C1","C2","C3","C4","C5","C6","S1","S2","S3","S4","B1","B2"]);
  assert.match(rules.find(c=>c.id==="S1").name, /受容/);
  const {record,response}=fixture(id);
  assert.equal(parseEvaluation(response,"email",record).score,20);
  const base=fixture(id,0);
  assert.equal(parseEvaluation(base.response,"email",base.record).score,18);
  const deduction={...base.response,deductions:[{id:"D3",points:2,evidence:"",comment:"主要指摘への未回答",ng_hit_ids:[]}]};
  assert.equal(parseEvaluation(deduction,"email",record).score,16);
  const invalid=structuredClone(response);invalid.criteria.find(c=>c.id==="B1").score=2;
  assert.throws(()=>parseEvaluation(invalid,"email",record));
  const missing=structuredClone(response);missing.criteria.pop();
  assert.throws(()=>parseEvaluation(missing,"email",record));
  assert.throws(()=>parseEvaluation({...response,rubric_version:"g4-mail-20261019-v1"},"email",record));
  const sheets=resultSheets([{...record,grading:{email:{attempts:[1,2,3].map(attempt=>({attempt,status:"success",response}))}}}]);
  assert.deepEqual(sheets[0].rows[1].slice(14,19),[10,8,2,0,MAIL_RUBRIC_VERSION]);
  assert.ok(JSON.stringify(sheets[2]).includes("特別加点："));
  const prompt=mailGradingPrompt(record.emailTest.scenario,record.emailTest.reply.body,[]);
  assert.match(prompt,new RegExp(`対象問題は${id}`));
  assert.match(prompt,/共通10点＋設問別8点＋特別加点2点/);
});

test("new starts retain selected scenario while old in-flight and historical grades retain the original rubric", () => {
  const old=presetEmailScenario("2-3","g4-mail-20261014-v1");
  const original=JSON.stringify(old);
  const current=currentEmailScenario(old);
  assert.equal(current.id,"2-3");assert.equal(current.rubricVersion,MAIL_RUBRIC_VERSION);
  assert.ok(!current.request.includes("正規のルールなのか"));
  assert.equal(JSON.stringify(old),original);
  assert.equal(scenarioRubricVersion(old),"g4-mail-20261019-v1");
  assert.match(mailGradingPrompt(old,"回答",[]),/g4-mail-20261019-v1/);
  const edited={...current,title:"管理者編集",version:"archived-uuid"};
  assert.deepEqual(currentEmailScenario(edited),edited);
  assert.equal(currentEmailScenario(null).id,"2-1");
  assert.equal(presetEmailScenario("2-3",MAIL_RUBRIC_VERSION).rubricVersion,MAIL_RUBRIC_VERSION);
  const rules=mailCriteria("2-3","g4-mail-20261019-v1");
  const response={rubric_version:"g4-mail-20261019-v1",max_score:20,criteria:rules.map(c=>({id:c.id,max_score:c.maxScore,score:c.maxScore,evidence:["回答"],comment:"旧採点"})),deductions:[],ng_decisions:[]};
  const record={emailTest:{scenario:old,reply:{body:"回答"},ngHits:[]},grading:{email:{attempts:[1,2,3].map(attempt=>({attempt,status:"success",response}))}}};
  const hydrated=withGradingSummaries(record);
  assert.equal(hydrated.grading.email.summary.score,20);
  assert.ok(hydrated.grading.email.attempts[0].evaluation.criteria.some(c=>c.id==="S6"));
  assert.ok(!hydrated.grading.email.attempts[0].evaluation.criteria.some(c=>c.id==="B1"));
  const mismatched=withGradingSummaries({...record,emailTest:{...record.emailTest,scenario:current}});
  assert.equal(mismatched.grading.email.summary.score,null);
});

test("all v2 scenarios are graded three times through the same email project with server-calculated scores", async () => {
  const keys=["BRAIN_API_ENDPOINT","BRAIN_API_KEY","BRAIN_API_PROJECT_ID_MAIL"];
  const previous=keys.map(k=>process.env[k]);const originalFetch=globalThis.fetch;
  const calls=[];
  try {
    process.env.BRAIN_API_ENDPOINT="https://brain.example.test";
    process.env.BRAIN_API_KEY="test-key";
    process.env.BRAIN_API_PROJECT_ID_MAIL="same-mail-project";
    for(const id of ["2-1","2-2","2-3"]) {
      const {record,response}=fixture(id);
      globalThis.fetch=async(url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({message:JSON.stringify(response)}));};
      const result=await gradeSubmission(record);
      assert.equal(result.email.status,"completed");assert.equal(result.email.summary.score,20);
    }
    assert.equal(calls.length,9);
    assert.ok(calls.every(c=>c.projectId==="same-mail-project"));
    assert.equal(new Set(calls.map(c=>c.uid)).size,9);
  } finally {
    globalThis.fetch=originalFetch;
    keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  }
});
