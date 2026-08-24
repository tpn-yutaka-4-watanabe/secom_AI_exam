"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateBadge } from "../components/CandidateBadge";
import { ExamShell } from "../components/ExamShell";
import { loadExamDraft, saveReceipt, updateEmailDraft } from "../lib/client-storage";
import { receivedEmail } from "@/lib/exam-content";
import type { EmailReply, ExamDraft, SubmissionReceipt } from "@/lib/types";

const initialReply: EmailReply = {
  to: "田中 一郎 様 <tanaka@example.jp>",
  subject: "Re: 新営業所の防犯対策について相談",
  body: "",
};

export default function EmailTestPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [reply, setReply] = useState<EmailReply>(initialReply);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = loadExamDraft();
      setDraft(stored);
      setReply(stored?.emailReply ?? initialReply);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (draft) updateEmailDraft(reply);
  }, [draft, reply]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || submitting) return;
    if (!draft.videoFindings.length) {
      setError("動画試験の回答がありません。動画試験に戻って入力してください。");
      return;
    }
    if (!reply.body.trim()) {
      setError("返信本文を入力してください。");
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
        body: JSON.stringify({ ...draft, emailReply: { ...reply, body: reply.body.trim() } }),
      });
      const payload = (await response.json()) as SubmissionReceipt & { error?: string };
      if (!response.ok) throw new Error(payload.error || "提出処理に失敗しました。");
      saveReceipt(payload);
      router.push("/complete");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "提出処理に失敗しました。");
      setSubmitting(false);
    }
  }

  if (!draft) {
    return (
      <ExamShell step={3}>
        <main className="missing-session">
          <h1>受験情報が確認できません</h1>
          <p>試験開始画面から受験を開始してください。</p>
          <Link href="/" className="primary-button">開始画面へ戻る</Link>
        </main>
      </ExamShell>
    );
  }

  return (
    <ExamShell step={3}>
      <main className="exam-page email-page">
        <div className="exam-title-row">
          <div>
            <div className="eyebrow">SECTION 02</div>
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
                    placeholder="田中様\n\nお問い合わせいただき、ありがとうございます。"
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
              <span>動画試験とメール試験の回答内容を確認しました。これを最終回答として提出します。</span>
            </label>
            <p>提出後は回答を変更できません。</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="exam-actions">
            <Link href="/video-test" className="secondary-button">動画試験に戻る</Link>
            <button className="primary-button submit-button" type="submit" disabled={submitting}>
              {submitting ? "回答を保存・採点しています…" : "試験を終了して提出する"}
              {!submitting && <span>→</span>}
            </button>
          </div>
        </form>
      </main>
    </ExamShell>
  );
}
