"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateBadge } from "../components/CandidateBadge";
import { ExamShell } from "../components/ExamShell";
import { ExamStartForm } from "../components/ExamStartForm";
import { saveReceipt } from "../lib/client-storage";
import type { EmailScenario, ExamDraft, SubmissionReceipt } from "@/lib/types";
export default function EmailTestPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [scenario, setScenario] = useState<EmailScenario | null>(null);
  const [body, setBody] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  useEffect(() => {
    if (!draft) return;
    let active = true;
    fetch("/api/exam-content/email", { cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "問題を読み込めませんでした。");
      if (active) setScenario(payload.scenario);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [draft]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !scenario || submitting) return;
    if (!body.trim() || !confirmed) { setError("本文と提出前の確認を入力してください。"); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examType: "email", candidateNumber: draft.candidateNumber, candidateName: draft.candidateName,
          startedAt: draft.startedAt, scenarioId: scenario.id, scenarioVersion: scenario.version, emailReply: { body } }) });
      const payload = await response.json() as SubmissionReceipt & { error?: string };
      if (!response.ok) throw new Error(payload.error || "提出に失敗しました。");
      saveReceipt(payload); router.replace("/complete");
    } catch (e) { setError(e instanceof Error ? e.message : "提出に失敗しました。"); setSubmitting(false); }
  }
  if (!draft) return <ExamShell step={1} examType="email"><ExamStartForm examType="email" onStarted={setDraft} /></ExamShell>;
  return <ExamShell step={2} examType="email"><main className="exam-page email-page">
    <div className="exam-title-row"><div><div className="eyebrow">EMAIL COMPOSITION EXAM</div><h1>メール作成試験</h1><p>状況説明とお客様のご指摘を読み、一次回答メールの本文を作成してください。</p></div><CandidateBadge number={draft.candidateNumber} name={draft.candidateName} /></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {!scenario ? <p>問題を読み込んでいます。読み込めない場合は試験官に申し出てください。</p> :
      <form onSubmit={submit}><div className="mail-workspace">
        <section className="mail-card"><div className="mail-label"><span>問題 {scenario.id}</span>{scenario.title}</div><div className="mail-body">{scenario.situation}</div><div className="mail-body">{scenario.request}</div></section>
        <section className="mail-card reply-mail"><div className="mail-label"><span>回答</span>作成するメール本文</div><div className="reply-fields">
          <label className="reply-body-field"><span>本文（宛名・挨拶・署名も本文に含めてください）</span><textarea rows={26} value={body} maxLength={20000} onChange={e => setBody(e.target.value)} placeholder="ここにメールの本文を入力してください。" required /><small>{body.length.toLocaleString("ja-JP")}文字</small></label>
        </div></section>
      </div><div className="final-confirmation"><label className="check-line"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>回答内容を確認しました。最終回答として提出します。</span></label></div>
      <div className="exam-actions"><span>再読み込み・画面を閉じると入力内容は失われます。</span><button className="primary-button" disabled={submitting}>{submitting ? "回答を保存・採点しています…" : "メール試験の回答を提出する"}</button></div></form>}
  </main></ExamShell>;
}
