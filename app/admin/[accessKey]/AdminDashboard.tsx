"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  BrainAttempt,
  EmailExamContent,
  ExamType,
  SubmissionRecord,
  VideoPlaybackState,
} from "@/lib/types";

function BrainAttempts({ attempts = [] }: { attempts?: BrainAttempt[] }) {
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
      {!attempts.length && <p className="no-attempts">採点結果はありません。</p>}
    </div>
  );
}

function submissionExamType(record: SubmissionRecord): ExamType | "combined" {
  if (record.examType) return record.examType;
  if (record.videoTest && record.emailTest) return "combined";
  return record.videoTest ? "video" : "email";
}

function examTypeLabel(record: SubmissionRecord) {
  const type = submissionExamType(record);
  if (type === "video") return "動画";
  if (type === "email") return "メール";
  return "動画＋メール";
}

export function AdminDashboard({ accessKey }: { accessKey: string }) {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [receivedEmail, setReceivedEmail] = useState<EmailExamContent | null>(null);
  const [videoPlayback, setVideoPlayback] = useState<VideoPlaybackState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [controllingVideo, setControllingVideo] = useState(false);
  const [error, setError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return submissions;
    return submissions.filter((item) =>
      `${item.candidateNumber} ${item.candidateName} ${item.id} ${examTypeLabel(item)}`.toLowerCase().includes(needle),
    );
  }, [query, submissions]);
  const selected = submissions.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  function adminHeaders(contentType = false) {
    return {
      "x-admin-path": accessKey,
      "x-admin-password": password,
      ...(contentType ? { "Content-Type": "application/json" } : {}),
    };
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const [submissionsResponse, settingsResponse] = await Promise.all([
        fetch("/api/admin/submissions", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/admin/exam-settings", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const submissionsPayload = (await submissionsResponse.json()) as { submissions?: SubmissionRecord[]; error?: string };
      const settingsPayload = (await settingsResponse.json()) as {
        receivedEmail?: EmailExamContent;
        videoPlayback?: VideoPlaybackState;
        error?: string;
      };
      if (!submissionsResponse.ok) throw new Error(submissionsPayload.error || "管理画面を開けませんでした。");
      if (!settingsResponse.ok) throw new Error(settingsPayload.error || "試験設定を読み込めませんでした。");
      setSubmissions(submissionsPayload.submissions ?? []);
      setSelectedId(submissionsPayload.submissions?.[0]?.id ?? null);
      setReceivedEmail(settingsPayload.receivedEmail ?? null);
      setVideoPlayback(settingsPayload.videoPlayback ?? null);
      setAuthenticated(true);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "管理者認証に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function saveEmailProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivedEmail || savingEmail) return;
    setSavingEmail(true);
    setError("");
    setSettingsMessage("");
    try {
      const response = await fetch("/api/admin/exam-settings", {
        method: "PUT",
        headers: adminHeaders(true),
        body: JSON.stringify({ receivedEmail }),
      });
      const payload = (await response.json()) as { receivedEmail?: EmailExamContent; error?: string };
      if (!response.ok || !payload.receivedEmail) throw new Error(payload.error || "メール問題を保存できませんでした。");
      setReceivedEmail(payload.receivedEmail);
      setSettingsMessage("メール問題を保存しました。次に開始する受験から反映されます。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "メール問題を保存できませんでした。");
    } finally {
      setSavingEmail(false);
    }
  }

  async function changeVideoPlayback(action: "start" | "reset") {
    const confirmation = action === "start"
      ? "受験者全員の動画を一斉再生します。開始してよろしいですか？"
      : "動画を待機状態に戻します。次の試験準備として実行してよろしいですか？";
    if (!window.confirm(confirmation)) return;
    setControllingVideo(true);
    setError("");
    setSettingsMessage("");
    try {
      const response = await fetch("/api/admin/exam-settings", {
        method: "PATCH",
        headers: adminHeaders(true),
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { videoPlayback?: VideoPlaybackState; error?: string };
      if (!response.ok || !payload.videoPlayback) throw new Error(payload.error || "動画状態を変更できませんでした。");
      setVideoPlayback(payload.videoPlayback);
      setSettingsMessage(action === "start" ? "一斉再生を開始しました。" : "動画を待機状態へ戻しました。");
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : "動画状態を変更できませんでした。");
    } finally {
      setControllingVideo(false);
    }
  }

  if (!authenticated) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <div className="admin-brand"><span>G4</span><strong>試験管理</strong></div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>管理者ログイン</h1>
          <p>グレード4認定試験の問題設定、動画制御、回答・採点結果を管理します。</p>
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
  const playbackActive = Boolean(videoPlayback?.startedAt);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand"><span>G4</span><strong>グレード4認定試験 <small>管理画面</small></strong></div>
        <button className="secondary-button small" onClick={() => setAuthenticated(false)}>ログアウト</button>
      </header>

      <section className="admin-summary">
        <div><span>提出件数</span><strong>{submissions.length}</strong><small>件</small></div>
        <div><span>採点完了</span><strong>{completed}</strong><small>件</small></div>
        <div><span>接続エラー</span><strong>{errors}</strong><small>件</small></div>
      </section>

      <section className="admin-exam-tools">
        <article className="video-control-card">
          <div className="admin-tool-heading">
            <div><span className="eyebrow">VIDEO CONTROL</span><h2>動画試験・一斉再生</h2></div>
            <span className={`control-status ${playbackActive ? "playing" : "waiting"}`}>
              {playbackActive ? "再生中" : "待機中"}
            </span>
          </div>
          <p>受験者全員が「再生準備を完了する」を押したことを確認してから開始してください。</p>
          {videoPlayback?.startedAt && <time>開始日時：{new Date(videoPlayback.startedAt).toLocaleString("ja-JP")}</time>}
          <div className="admin-tool-actions">
            <button className="primary-button" type="button" onClick={() => changeVideoPlayback("start")} disabled={controllingVideo || playbackActive}>
              全受験者の動画を一斉再生
            </button>
            <button className="secondary-button" type="button" onClick={() => changeVideoPlayback("reset")} disabled={controllingVideo}>
              次回試験の待機状態へ戻す
            </button>
          </div>
        </article>

        <article className="email-settings-card">
          <details>
            <summary>
              <span><span className="eyebrow">EMAIL QUESTION</span><strong>メール試験・受信内容を編集</strong></span>
              <small>本番問題への切り替え</small>
            </summary>
            {receivedEmail && (
              <form className="email-settings-form" onSubmit={saveEmailProblem}>
                <div className="email-settings-grid">
                  <label><span>差出人</span><input value={receivedEmail.from} onChange={(event) => setReceivedEmail({ ...receivedEmail, from: event.target.value })} required /></label>
                  <label><span>宛先</span><input value={receivedEmail.to} onChange={(event) => setReceivedEmail({ ...receivedEmail, to: event.target.value })} required /></label>
                  <label><span>日時</span><input value={receivedEmail.date} onChange={(event) => setReceivedEmail({ ...receivedEmail, date: event.target.value })} required /></label>
                  <label><span>件名</span><input value={receivedEmail.subject} onChange={(event) => setReceivedEmail({ ...receivedEmail, subject: event.target.value })} required /></label>
                </div>
                <label className="email-question-body"><span>本文</span><textarea rows={14} value={receivedEmail.body} onChange={(event) => setReceivedEmail({ ...receivedEmail, body: event.target.value })} required /></label>
                <div className="admin-tool-actions">
                  <span>保存後に開始した受験者から新しい内容が表示されます。</span>
                  <button className="primary-button" type="submit" disabled={savingEmail}>{savingEmail ? "保存しています…" : "メール問題を保存"}</button>
                </div>
              </form>
            )}
          </details>
        </article>
      </section>

      {settingsMessage && <div className="admin-settings-message success">{settingsMessage}</div>}
      {error && <div className="admin-settings-message error">{error}</div>}

      <div className="admin-workspace">
        <aside className="submission-list">
          <div className="list-head">
            <div><span className="eyebrow">SUBMISSIONS</span><h1>受験結果</h1></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="受験番号・氏名・試験種別で検索" aria-label="受験結果を検索" />
          </div>
          <div className="submission-items">
            {filtered.map((item) => (
              <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
                <span className={`result-dot ${item.overallStatus}`} />
                <span><strong>{item.candidateNumber}</strong><small>{item.candidateName}</small><em>{examTypeLabel(item)}</em></span>
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
                  <span className="eyebrow">RESULT DETAIL / {examTypeLabel(selected)}</span>
                  <h2>{selected.candidateName} <small>{selected.candidateNumber}</small></h2>
                  <p>受付番号 {selected.id} ／ {new Date(selected.submittedAt).toLocaleString("ja-JP")}</p>
                </div>
                <span className={`result-pill ${selected.overallStatus}`}>
                  {selected.overallStatus === "completed" ? "採点完了" : "接続エラーあり"}
                </span>
              </div>

              {selected.videoTest && (
                <section className="result-section">
                  <div className="section-title"><span>V</span><div><h3>動画確認試験</h3><p>{selected.videoTest.findings.length}件の回答（旧形式は○×を「旧形式」と表示）</p></div></div>
                  <div className="admin-findings-table scene-assessment">
                    <div className="admin-table-head"><span>シーン</span><span>○／×</span><span>理由・ポイント</span></div>
                    {selected.videoTest.findings.map((finding) => (
                      <div className="admin-table-row" key={finding.id}>
                        <p>{finding.scene ?? finding.issue}</p><p>{finding.judgment ?? "旧形式"}</p><p>{finding.reason ?? finding.recommendation}</p>
                      </div>
                    ))}
                  </div>
                  <BrainAttempts attempts={selected.grading.video?.attempts} />
                </section>
              )}

              {selected.emailTest && (
                <section className="result-section">
                  <div className="section-title"><span>M</span><div><h3>メール対応試験</h3><p>顧客への返信内容</p></div></div>
                  <details className="admin-received-email">
                    <summary>出題した受信メールを確認</summary>
                    <strong>{selected.emailTest.receivedEmail.subject}</strong>
                    <pre>{selected.emailTest.receivedEmail.body}</pre>
                  </details>
                  <div className="admin-mail-answer">
                    <div><span>宛先</span><strong>{selected.emailTest.reply.to}</strong></div>
                    <div><span>件名</span><strong>{selected.emailTest.reply.subject}</strong></div>
                    <pre>{selected.emailTest.reply.body}</pre>
                  </div>
                  <BrainAttempts attempts={selected.grading.email?.attempts} />
                </section>
              )}
            </>
          ) : (
            <div className="empty-detail"><strong>受験結果がありません</strong><p>受験者が提出すると、ここに結果が表示されます。</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
