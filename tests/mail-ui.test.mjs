import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const require=createRequire(import.meta.url);
const source=await read("app/components/MailRequest.tsx");
const js=ts.transpileModule(source,{fileName:"MailRequest.tsx",compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 .replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
const {MailRequest}=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const reference=JSON.parse(await read("lib/mail-reference-v2.json"));

test("portal link text is exactly 開く for both exams, with distinct accessible names",async()=>{
 const page=await read("app/page.tsx");
 for(const path of ["video-test","email-test"]){
  assert.match(page,new RegExp(`<Link href="/${path}"[^>]+>開く</Link>`));
 }
 assert.doesNotMatch(page,/>動画試験を開く|>メール試験を開く|<span>→<\/span>/);
 assert.match(page,/aria-label="動画確認試験を開く"/);
 assert.match(page,/aria-label="メール対応力試験を開く"/);
});

test("all three mail problem headings render bold and red without changing the question text",async()=>{
 const heading="■お客様からのご指摘・要請内容";
 for(const scenario of reference.scenarios){
  const html=renderToStaticMarkup(createElement(MailRequest,{text:scenario.request}));
  assert.ok(html.includes(`<strong class="mail-request-heading">${heading}</strong>`));
  assert.equal((html.match(/<strong/g)||[]).length,1);
  assert.ok(html.includes(scenario.request.slice(heading.length)));
 }
 const css=await read("app/globals.css");
 assert.match(css,/\.mail-request-heading\s*\{[^}]*color:\s*var\(--red-dark\);[^}]*font-weight:\s*700;/);
 assert.match(await read("app/email-test/page.tsx"),/<MailRequest text=\{scenario.request\} \/>/);
});

test("admin-authored mail text remains plain text, including HTML-looking content and heading-free questions",()=>{
 const text='■お客様からのご指摘・要請内容\n<script>alert("test")</script>\n本文';
 const html=renderToStaticMarkup(createElement(MailRequest,{text}));
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 const plain="独自の見出し\n本文を変更しない";
 assert.equal(renderToStaticMarkup(createElement(MailRequest,{text:plain})),`<div class="mail-body">${plain}</div>`);
});

test("the content of both numbered requests is red with normal weight, while the heading stays bold",async()=>{
 const heading="■お客様からのご指摘・要請内容";
 for(const scenario of reference.scenarios){
  const body=scenario.request.slice(heading.length);
  assert.match(body,/①/);assert.match(body,/②/);
  const html=renderToStaticMarkup(createElement(MailRequest,{text:scenario.request}));
  assert.ok(html.includes(`<strong class="mail-request-heading">${heading}</strong><span class="mail-request-content">${body}</span>`));
  assert.equal((html.match(/mail-request-content/g)||[]).length,1);
 }
 const css=await read("app/globals.css");
 assert.match(css,/\.mail-request-content\s*\{[^}]*color:\s*var\(--red-dark\);[^}]*font-weight:\s*400;/);
 const preamble="状況説明は通常色\n";
 const html=renderToStaticMarkup(createElement(MailRequest,{text:preamble+heading+"\n①指摘\n②指摘"}));
 assert.ok(html.startsWith(`<div class="mail-body">${preamble}<strong`));
});
