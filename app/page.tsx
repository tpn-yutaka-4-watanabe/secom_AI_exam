"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExamShell } from "./components/ExamShell";
import { clearExamDraft, loadExamDraft, saveExamDraft } from "./lib/client-storage";

export default function StartPage() {
  const router = useRouter();
  const [candidateNumber, setCandidateNumber] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const existing = loadExamDraft();
      setCandidateNumber(existing?.candidateNumber ?? "");
      setCandidateName(existing?.candidateName ?? "");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = candidateNumber.trim();
    const name = candidateName.trim();
    if (!number || !name) return;

    clearExamDraft();
    saveExamDraft({
      candidateNumber: number,
      candidateName: name,
      startedAt: new Date().toISOString(),
      videoFindings: [],
      emailReply: null,
    });
    router.push("/video-test");
  }

  return (
    <ExamShell step={1} compactHeader>
      <main className="start-layout">
        <section className="start-hero">
          <div className="eyebrow">GRADE 4 CERTIFICATION</div>
          <h1>グレード4<br />認定試験</h1>
          <p className="start-lead">
            状況を正確に捉え、相手に伝わる形で判断を言語化するための認定試験です。
          </p>

          <div className="exam-outline">
            <article>
              <span className="outline-number">01</span>
              <div>
                <h2>動画確認試験</h2>
                <p>映像内で気づいた不適切な箇所と、望ましい対応を記録します。</p>
              </div>
            </article>
            <article>
              <span className="outline-number">02</span>
              <div>
                <h2>メール対応試験</h2>
                <p>顧客から届いた警備に関する質問メールへ返信を作成します。</p>
              </div>
            </article>
          </div>
        </section>

        <section className="start-card" aria-labelledby="candidate-heading">
          <div className="card-kicker">受験情報</div>
          <h2 id="candidate-heading">試験を開始する</h2>
          <p>試験官の案内を確認し、受験番号と氏名を入力してください。</p>

          <form onSubmit={handleSubmit} className="start-form">
            <label>
              <span>受験番号</span>
              <input
                name="candidateNumber"
                value={candidateNumber}
                onChange={(event) => setCandidateNumber(event.target.value)}
                placeholder="例：G4-001"
                autoComplete="off"
                required
                disabled={!ready}
              />
            </label>
            <label>
              <span>受験者名</span>
              <input
                name="candidateName"
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
                placeholder="例：山田 太郎"
                autoComplete="name"
                required
                disabled={!ready}
              />
            </label>

            <div className="start-notice">
              <span className="notice-mark">!</span>
              <p>試験開始後はブラウザを閉じず、試験官の指示に従って進めてください。</p>
            </div>

            <button className="primary-button wide" type="submit" disabled={!ready}>
              試験を開始する
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      </main>
    </ExamShell>
  );
}
