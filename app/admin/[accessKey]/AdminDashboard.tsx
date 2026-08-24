"use client";

import { FormEvent, useMemo, useState } from "react";
import type { BrainAttempt, SubmissionRecord } from "@/lib/types";

function BrainAttempts({ attempts }: { attempts: BrainAttempt[] }) {
  return (
    <div className="attempt-grid">
      {attempts.map((attempt) => (
        <article className={`attempt-card ${attempt.status}`} key={attempt.attempt}>
          <div className="attempt-head">
            <strong>採点 {attempt.attempt}回目</strong>
            <span>{attempt.status === "success" ? "完了" : "エラー"}</span>
          </div>
          {attempt.status === "success" ? (
            <>
              <p>{attempt.message || "応答本文なし"}</p>
              <details><summary>生レスポンス</summary><pre>{JSON.stringify(attempt.response, null, 2)}</pre></details>
            </>
          ) : (
            <p className="attempt-error">{attempt.error}</p>
          )}
        </article>
      ))}
    </div>
  );
}

export function AdminDashboard({ accessKey }: { accessKey: string }) {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return submissions;
    return submissions.filter((item) =>
      `${item.candidateNumber} ${item.candidateName} ${item.id}`.toLowerCase().includes(needle),
    );
  }, [query, submissions]);
  const selected = submissions.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/submissions", {
        headers: { "x-admin-path": accessKey, "x-admin-password": password },
        cache: "no-store",
      });
      const payload = (await response.json()) as { submissions?: SubmissionRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "管理画面を開けませんでした。");
      setSubmissions(payload.submissions ?? []);
      setSelectedId(payload.submissions?.[0]?.id ?? null);
      setAuthenticated(true);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "管理者認証に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <div className="admin-brand"><span>G4</span><strong>試験管理</strong></div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>管理者ログイン</h1>
          <p>グレード4認定試験の回答・採点結果を確認します。</p>
          <form onSubmit={signIn}>
            <label><span>管理者パスワード</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required /></label>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "確認しています…" : "管理画面を開く"}</button>
          </form>
        </section>
      </main>
    );
  }

  const completed = submissions.filter((item) => item.overallStatus === "completed").length;
  const errors = submissions.length - completed;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand"><span>G4</span><strong>グレード4認定試験 <small>管理画面</small></strong></div>
        <button className="secondary-button small" onClick={() => setAuthenticated(false)}>ログアウト</button>
      </header>

      <section className="admin-summary">
        <div><span>受験者数</span><strong>{submissions.length}</strong><small>名</small></div>
        <div><span>採点完了</span><strong>{completed}</strong><small>件</small></div>
        <div><span>接続エラー</span><strong>{errors}</strong><small>件</small></div>
      </section>

      <div className="admin-workspace">
        <aside className="submission-list">
          <div className="list-head">
            <div><span className="eyebrow">SUBMISSIONS</span><h1>受験結果</h1></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="受験番号・氏名で検索" aria-label="受験結果を検索" />
          </div>
          <div className="submission-items">
            {filtered.map((item) => (
              <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
                <span className={`result-dot ${item.overallStatus}`} />
                <span><strong>{item.candidateNumber}</strong><small>{item.candidateName}</small></span>
                <time>{new Date(item.submittedAt).toLocaleDateString("ja-JP")}</time>
              </button>
            ))}
            {!filtered.length && <div className="empty-list">該当する受験結果はありません。</div>}
          </div>
        </aside>

        <section className="submission-detail">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <span className="eyebrow">RESULT DETAIL</span>
                  <h2>{selected.candidateName} <small>{selected.candidateNumber}</small></h2>
                  <p>受付番号 {selected.id} ／ {new Date(selected.submittedAt).toLocaleString("ja-JP")}</p>
                </div>
                <span className={`result-pill ${selected.overallStatus}`}>
                  {selected.overallStatus === "completed" ? "採点完了" : "接続エラーあり"}
                </span>
              </div>

              <section className="result-section">
                <div className="section-title"><span>01</span><div><h3>動画確認試験</h3><p>{selected.videoTest.findings.length}件の指摘</p></div></div>
                <div className="admin-findings-table">
                  <div className="admin-table-head"><span>時刻</span><span>分類</span><span>指摘事項</span><span>あるべき対応</span></div>
                  {selected.videoTest.findings.map((finding) => (
                    <div className="admin-table-row" key={finding.id}>
                      <span>{finding.time || "—"}</span><span>{finding.category}</span><p>{finding.issue}</p><p>{finding.recommendation}</p>
                    </div>
                  ))}
                </div>
                <BrainAttempts attempts={selected.grading.video.attempts} />
              </section>

              <section className="result-section">
                <div className="section-title"><span>02</span><div><h3>メール対応試験</h3><p>顧客への返信内容</p></div></div>
                <div className="admin-mail-answer">
                  <div><span>宛先</span><strong>{selected.emailTest.reply.to}</strong></div>
                  <div><span>件名</span><strong>{selected.emailTest.reply.subject}</strong></div>
                  <pre>{selected.emailTest.reply.body}</pre>
                </div>
                <BrainAttempts attempts={selected.grading.email.attempts} />
              </section>
            </>
          ) : (
            <div className="empty-detail"><strong>受験結果がありません</strong><p>受験者が提出すると、ここに結果が表示されます。</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
