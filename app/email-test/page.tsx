"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateBadge } from "../components/CandidateBadge";
import { ExamShell } from "../components/ExamShell";
import { ExamStartForm } from "../components/ExamStartForm";
import {
  clearExamDraft,
  loadExamDraft,
  saveReceipt,
  saveReceivedEmailDraft,
  updateEmailDraft,
} from "../lib/client-storage";
import type { EmailReply, ExamDraft, ReceivedEmail, SubmissionReceipt } from "@/lib/types";

function initialReply(receivedEmail: ReceivedEmail): EmailReply {
  return {
    to: receivedEmail.from,
    subject: `Re: ${receivedEmail.subject}`,
    body: "",
  };
}

export default function EmailTestPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [receivedEmail, setReceivedEmail] = useState<ReceivedEmail | null>(null);
  const [reply, setReply] = useState<EmailReply | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = loadExamDraft("email");
      setDraft(stored);
      if (stored?.receivedEmail) {
        setReceivedEmail(stored.receivedEmail);
        setReply(stored.emailReply ?? initialReply(stored.receivedEmail));
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!draft || receivedEmail) return;
    const activeDraft = draft;
    let active = true;

    async function loadContent() {
      try {
        const response = await fetch("/api/exam-content/email", { cache: "no-store" });
        const payload = (await response.json()) as { receivedEmail?: ReceivedEmail; error?: string };
        if (!response.ok || !payload.receivedEmail) throw new Error(payload.error || "受信メールを読み込めませんでした。");
        if (!active) return;
        setReceivedEmail(payload.receivedEmail);
        saveReceivedEmailDraft(payload.receivedEmail);
        setReply(activeDraft.emailReply ?? initialReply(payload.receivedEmail));
      } catch (contentError) {
        if (active) setError(contentError instanceof Error ? contentError.message : "受信メールを読み込めませんでした。");
      }
    }

    void loadContent();
    return () => { active = false; };
  }, [draft, receivedEmail]);

  useEffect(() => {
    if (draft && reply) updateEmailDraft(reply);
  }, [draft, reply]);

  function beginDraft(startedDraft: ExamDraft) {
    setDraft(startedDraft);
    setReceivedEmail(null);
    setReply(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !receivedEmail || !reply || submitting) return;
    if (!reply.to.trim() || !reply.subject.trim() || !reply.body.trim()) {
      setError("宛先、件名、返信本文をすべて入力してください。");
      return;
    }
    if (!confirmed) {
      setError("提出前の確認にチェックしてください。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examType: "email",
          candidateNumber: draft.candidateNumber,
          candidateName: draft.candidateName,
          startedAt: draft.startedAt,
          receivedEmail,
          emailReply: {
            to: reply.to.trim(),
            subject: reply.subject.trim(),
            body: reply.body.trim(),
          },
        }),
      });
      const payload = (await response.json()) as SubmissionReceipt & { error?: string };
      if (!response.ok) throw new Error(payload.error || "提出処理に失敗しました。");
      saveReceipt(payload);
      clearExamDraft("email");
      router.push("/complete");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "提出処理に失敗しました。");
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <ExamShell step={1} examType="email"><main className="page-loading">読み込んでいます…</main></ExamShell>;
  }

  if (!draft) {
    return (
      <ExamShell step={1} examType="email">
        <ExamStartForm examType="email" onStarted={beginDraft} />
      </ExamShell>
    );
  }

  if (!receivedEmail || !reply) {
    return (
      <ExamShell step={2} examType="email">
        <main className="missing-session">
          <h1>メール問題を読み込んでいます</h1>
          <p>このまま少しお待ちください。</p>
          {error && <div className="form-error">{error}</div>}
        </main>
      </ExamShell>
    );
  }

  return (
    <ExamShell step={2} examType="email">
      <main className="exam-page email-page">
        <div className="exam-title-row">
          <div>
            <div className="eyebrow">EMAIL RESPONSE EXAM</div>
            <h1>メール対応試験</h1>
            <p>受領メールを読み、営業担当者として適切な返信を作成してください。</p>
          </div>
          <CandidateBadge number={draft.candidateNumber} name={draft.candidateName} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mail-workspace">
            <section className="mail-card received-mail" aria-label="受領メール">
              <div className="mail-label"><span>受信</span> 顧客からのメール</div>
              <dl className="mail-headers">
                <div><dt>差出人</dt><dd>{receivedEmail.from}</dd></div>
                <div><dt>宛先</dt><dd>{receivedEmail.to}</dd></div>
                <div><dt>日時</dt><dd>{receivedEmail.date}</dd></div>
                <div><dt>件名</dt><dd><strong>{receivedEmail.subject}</strong></dd></div>
              </dl>
              <div className="mail-body">{receivedEmail.body}</div>
            </section>

            <section className="mail-card reply-mail" aria-label="返信メール作成">
              <div className="mail-label"><span>返信</span> 作成するメール</div>
              <div className="reply-fields">
                <label>
                  <span>宛先</span>
                  <input value={reply.to} onChange={(event) => setReply({ ...reply, to: event.target.value })} required />
                </label>
                <label>
                  <span>件名</span>
                  <input value={reply.subject} onChange={(event) => setReply({ ...reply, subject: event.target.value })} required />
                </label>
                <label className="reply-body-field">
                  <span>本文</span>
                  <textarea
                    value={reply.body}
                    onChange={(event) => setReply({ ...reply, body: event.target.value })}
                    placeholder="ご担当者様\n\nお問い合わせいただき、ありがとうございます。"
                    rows={18}
                    required
                  />
                  <small>{reply.body.length.toLocaleString("ja-JP")}文字</small>
                </label>
              </div>
            </section>
          </div>

          <div className="final-confirmation">
            <label className="check-line">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>メール対応試験の回答内容を確認しました。これを最終回答として提出します。</span>
            </label>
            <p>提出後は回答を変更できません。</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="exam-actions">
            <span className="autosave-note">入力内容はこの端末に自動保存されます</span>
            <button className="primary-button submit-button" type="submit" disabled={submitting}>
              {submitting ? "回答を保存・採点しています…" : "メール試験の回答を提出する"}
              {!submitting && <span>→</span>}
            </button>
          </div>
        </form>
      </main>
    </ExamShell>
  );
}
