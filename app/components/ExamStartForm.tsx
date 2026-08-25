"use client";

import { FormEvent, useState } from "react";
import { startExamDraft } from "../lib/client-storage";
import type { ExamDraft, ExamType } from "@/lib/types";

const examCopy: Record<ExamType, { number: string; title: string; description: string; notice: string }> = {
  video: {
    number: "01",
    title: "動画確認試験",
    description: "映像を確認し、不適切だと考える箇所と、あるべき対応を記入します。",
    notice: "受験情報を入力後、再生準備を行い、試験官の一斉再生を待ってください。",
  },
  email: {
    number: "02",
    title: "メール対応試験",
    description: "顧客から届いた警備に関する質問メールへの返信を作成します。",
    notice: "受信メールの内容を確認し、営業担当者として返信を作成してください。",
  },
};

export function ExamStartForm({ examType, onStarted }: { examType: ExamType; onStarted: (draft: ExamDraft) => void }) {
  const copy = examCopy[examType];
  const [candidateNumber, setCandidateNumber] = useState("");
  const [candidateName, setCandidateName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = candidateNumber.trim();
    const name = candidateName.trim();
    if (!number || !name) return;
    onStarted(startExamDraft(examType, number, name));
  }

  return (
    <main className="single-exam-start">
      <section className="single-exam-intro">
        <div className="eyebrow">GRADE 4 CERTIFICATION / EXAM {copy.number}</div>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <div className="single-exam-notice">
          <strong>受験前の確認</strong>
          <span>{copy.notice}</span>
        </div>
      </section>

      <section className="start-card" aria-labelledby="candidate-heading">
        <div className="card-kicker">CANDIDATE INFORMATION</div>
        <h2 id="candidate-heading">受験情報を入力</h2>
        <p>試験官の案内を確認し、受験番号と氏名を入力してください。</p>
        <form onSubmit={submit} className="start-form">
          <label>
            <span>受験番号</span>
            <input
              value={candidateNumber}
              onChange={(event) => setCandidateNumber(event.target.value)}
              placeholder="例：G4-001"
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>受験者名</span>
            <input
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
              placeholder="例：山田 太郎"
              autoComplete="name"
              required
            />
          </label>
          <button className="primary-button wide" type="submit">
            {copy.title}を開始する <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
