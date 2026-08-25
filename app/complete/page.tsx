"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExamShell } from "../components/ExamShell";
import { clearExamData, loadReceipt } from "../lib/client-storage";
import type { SubmissionReceipt } from "@/lib/types";

export default function CompletePage() {
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setReceipt(loadReceipt()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function restart() {
    if (receipt) clearExamData(receipt.examType);
  }

  return (
    <ExamShell step={3} examType={receipt?.examType} compactHeader>
      <main className="complete-page">
        <div className="complete-mark" aria-hidden="true">✓</div>
        <div className="eyebrow">EXAM COMPLETED</div>
        <h1>試験は終了しました</h1>
        <p className="complete-lead">回答を受け付けました。試験官の指示があるまで、この画面を表示したままお待ちください。</p>

        {receipt ? (
          <section className="receipt-card">
            <div><span>受付番号</span><strong>{receipt.id}</strong></div>
            <div><span>受験番号</span><strong>{receipt.candidateNumber}</strong></div>
            <div><span>受験者名</span><strong>{receipt.candidateName}</strong></div>
            <div><span>試験種別</span><strong>{receipt.examType === "video" ? "動画確認試験" : "メール対応試験"}</strong></div>
            <div><span>受付日時</span><strong>{new Date(receipt.submittedAt).toLocaleString("ja-JP")}</strong></div>
            <div className="receipt-status">
              <span>採点接続状況</span>
              {receipt.overallStatus === "completed" ? (
                <strong className="status-success">BrainAPI採点完了</strong>
              ) : (
                <strong className="status-warning">回答保存済み・BrainAPI接続エラー記録済み</strong>
              )}
            </div>
          </section>
        ) : (
          <section className="receipt-card empty-receipt">この端末では受付情報を確認できませんでした。</section>
        )}

        <div className="complete-note">
          <strong>お疲れさまでした</strong>
          <p>採点結果は管理画面に保存されます。受験者本人にはこの画面で得点を表示しません。</p>
        </div>

        {receipt && (
          <Link href={receipt.examType === "video" ? "/video-test" : "/email-test"} onClick={restart} className="text-link">
            同じ試験を別の受験者で開始する
          </Link>
        )}
        <Link href="/" className="text-link">試験選択へ戻る</Link>
      </main>
    </ExamShell>
  );
}
