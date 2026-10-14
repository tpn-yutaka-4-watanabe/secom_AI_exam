"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  BrainAttempt,
  EmailScenario,
  GradingResult,
  ExamType,
  SubmissionRecord,
} from "@/lib/types";

function GradeSummary({ result }: { result?: GradingResult }) {
  const s = result?.summary;
  const selected = result?.attempts.find(a => a.attempt === s?.selectedAttempt)?.evaluation;
  return <div className="grading-summary">
    <h3>採用点：{s?.score ?? "未確定"} {selected ? `/ ${selected.maxScore}` : ""}</h3>
    <p>3回の得点：{s?.scores.map(v => v ?? "未取得").join(" / ") || "未取得"}　／　{s?.method === "mode" ? "最頻値" : s?.method === "median" ? "中央値" : "3回分の正常な採点が必要です"}</p>
    {s?.needsReview && <p className="attempt-error">要確認：得点は暫定です。接続・形式・採点内容を確認してください。</p>}
    {selected && <><p>共有する評価：採点{s?.selectedAttempt}回目</p><p>{selected.summary}</p>
      <table className="score-table"><thead><tr><th>評価項目</th><th>点数</th><th>評価</th></tr></thead><tbody>{selected.criteria.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.score} / {c.maxScore}</td><td>{c.comment}</td></tr>)}</tbody></table>
      {selected.deductions.map((d, i) => <p key={i}>減点 {d.points}点：{d.comment} {d.evidence}</p>)}
    </>}
  </div>;
}

function BrainAttempts({ attempts = [] }: { attempts?: BrainAttempt[] }) {
  return (
    <div className="attempt-grid">
      {attempts.map((attempt) => (
        <article className={`attempt-card ${attempt.status}`} key={attempt.attempt}>
          <div className="attempt-head">
            <strong>採点 {attempt.attempt}回目</strong>
            <span>{attempt.status === "success" ? "完了" : "エラー"}</span>
          </div>
          {attempt.httpStatus && <small>HTTP {attempt.httpStatus}</small>}
          {attempt.status === "success" ? (
            <>
              <p>{attempt.evaluation ? `${attempt.evaluation.score} / ${attempt.evaluation.maxScore}点` : attempt.validationError || "点数を確認できません。"}</p>
              <details><summary>この回の評価</summary><pre>{attempt.message || "応答本文なし"}</pre></details>
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
  const [scenario, setScenario] = useState<EmailScenario | null>(null);
  const [options, setOptions] = useState<EmailScenario[]>([]);
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [error, setError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return submissions;
    return submissions.filter((item) =>
      `${item.candidateNumber} ${item.candidateName} ${item.id} ${examTypeLabel(item)}`.toLowerCase().includes(needle),
    );
  }, [query, submissions]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  function adminHeaders(contentType = false) {
    return {
      "x-admin-path": accessKey,
      "x-admin-password": password,
      ...(contentType ? { "Content-Type": "application/json" } : {}),
    };
  }

  async function signIn(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const [submissionsResponse, settingsResponse] = await Promise.all([
        fetch("/api/admin/submissions", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/admin/exam-settings", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const submissionsPayload = (await submissionsResponse.json()) as { submissions?: SubmissionRecord[]; error?: string };
      const settingsPayload = (await settingsResponse.json()) as {
        scenario?: EmailScenario;
        options?: EmailScenario[];
        error?: string;
      };
      if (!submissionsResponse.ok) throw new Error(submissionsPayload.error || "管理画面を開けませんでした。");
      if (!settingsResponse.ok) throw new Error(settingsPayload.error || "試験設定を読み込めませんでした。");
      setSubmissions(submissionsPayload.submissions ?? []);
      setSelectedId(submissionsPayload.submissions?.[0]?.id ?? null);
      setScenario(settingsPayload.scenario ?? null);
      setOptions(settingsPayload.options ?? []);
      setAuthenticated(true);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "管理者認証に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function saveEmailProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scenario || savingEmail) return;
    setSavingEmail(true);
    setError("");
    setSettingsMessage("");
    try {
      const response = await fetch("/api/admin/exam-settings", {
        method: "PUT",
        headers: adminHeaders(true),
        body: JSON.stringify({ scenario }),
      });
      const payload = (await response.json()) as { scenario?: EmailScenario; error?: string };
      if (!response.ok || !payload.scenario) throw new Error(payload.error || "メール問題を保存できませんでした。");
      setScenario(payload.scenario);
      setSettingsMessage("メール問題を保存しました。次に開始する受験から反映されます。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "メール問題を保存できませんでした。");
    } finally {
      setSavingEmail(false);
    }
  }

  async function downloadExcel() {
    setExporting(true); setError("");
    try {
      const response = await fetch("/api/admin/export", { method: "POST", headers: adminHeaders(true),
        body: JSON.stringify({ ids: filtered.map(record => record.id) }) });
      if (!response.ok) throw new Error("Excel出力に失敗しました。");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "grade4-results.xlsx";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Excel出力に失敗しました。"); }
    finally { setExporting(false); }
  }

  if (!authenticated) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <div className="admin-brand"><span>G4</span><strong>試験管理</strong></div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>管理者ログイン</h1>
          <p>グレード4認定試験の問題設定、回答・採点結果を管理します。</p>
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
        <div className="admin-tool-actions"><button className="secondary-button small" onClick={() => void signIn()} disabled={loading}>結果を更新</button><button className="primary-button small" onClick={downloadExcel} disabled={exporting || !filtered.length}>{exporting ? "出力中…" : `表示中の${filtered.length}件をExcel出力`}</button><button className="secondary-button small" onClick={() => setAuthenticated(false)}>ログアウト</button></div>
      </header>

      <section className="admin-summary">
        <div><span>提出件数</span><strong>{submissions.length}</strong><small>件</small></div>
        <div><span>採点完了</span><strong>{completed}</strong><small>件</small></div>
        <div><span>採点未完了</span><strong>{errors}</strong><small>件</small></div>
      </section>

      <section className="admin-exam-tools">
        <article className="email-settings-card">
          <details><summary><span><span className="eyebrow">EMAIL QUESTION</span><strong>メール試験・状況説明を編集</strong></span><small>2-1 / 2-2（2-3は個別対応のため保留）</small></summary>
          {scenario && <form className="email-settings-form" onSubmit={saveEmailProblem}>
            <label><span>対象問題</span><select value={scenario.id} onChange={e => { const preset = options.find(p => p.id === e.target.value); if (preset) setScenario({ ...preset }); }}>
              {options.map(p => <option key={p.id} value={p.id} disabled={!p.enabled}>{p.id}：{p.title}{p.enabled ? "" : "（保留）"}</option>)}
            </select></label>
            <label><span>問題名</span><input value={scenario.title} onChange={e => setScenario({ ...scenario, title: e.target.value })} required /></label>
            <label><span>状況説明</span><textarea rows={12} value={scenario.situation} onChange={e => setScenario({ ...scenario, situation: e.target.value })} required /></label>
            <label><span>お客様のご指摘・要請</span><textarea rows={10} value={scenario.request} onChange={e => setScenario({ ...scenario, request: e.target.value })} required /></label>
            <p>保存後に開始する受験から反映します。採点基準を変えるほど問題を変更する場合は、基準も別途更新してください。</p>
            <button className="primary-button" disabled={savingEmail}>{savingEmail ? "保存中…" : "メール問題を保存"}</button>
          </form>}
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
                  <GradeSummary result={selected.grading.video} />
                  <BrainAttempts attempts={selected.grading.video?.attempts} />
                </section>
              )}

              {selected.emailTest && (
                <section className="result-section">
                  <div className="section-title"><span>M</span><div><h3>メール対応試験</h3><p>作成したメール本文</p></div></div>
                  <details className="admin-received-email">
                    <summary>出題した状況を確認</summary>
                    <strong>{selected.emailTest.scenario?.title ?? selected.emailTest.receivedEmail?.subject}</strong>
                    <pre>{selected.emailTest.scenario ? `${selected.emailTest.scenario.situation}\n\n${selected.emailTest.scenario.request}` : selected.emailTest.receivedEmail?.body}</pre>
                  </details>
                  <div className="admin-mail-answer">
                    {selected.emailTest.reply.to && <div><span>宛先</span><strong>{selected.emailTest.reply.to}</strong></div>}
                    {selected.emailTest.reply.subject && <div><span>件名</span><strong>{selected.emailTest.reply.subject}</strong></div>}
                    <pre>{selected.emailTest.reply.body}</pre>
                  </div>
                  <GradeSummary result={selected.grading.email} />
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
