"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateBadge } from "../components/CandidateBadge";
import { ExamShell } from "../components/ExamShell";
import { ExamStartForm } from "../components/ExamStartForm";
import { saveReceipt } from "../lib/client-storage";
import type { ExamDraft, SubmissionReceipt, VideoFinding } from "@/lib/types";
const initialRowCount = 6;
const createFinding = (): VideoFinding => ({ id: crypto.randomUUID(), scene: "", judgment: "", reason: "" });
export default function VideoTestPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [findings, setFindings] = useState<VideoFinding[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  function begin(d: ExamDraft) {
    setDraft(d); setFindings(Array.from({ length: initialRowCount }, createFinding));
  }
  function update<K extends "scene" | "judgment" | "reason">(id: string, key: K, value: VideoFinding[K]) {
    setFindings(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row));
  }
  async function submit() {
    if (!draft || submitting) return;
    const used = findings.filter(row => row.scene.trim() || row.judgment || row.reason.trim());
    if (!used.length || used.some(row => !row.scene.trim() || !row.judgment || !row.reason.trim())) {
      setError("記入した行のシーン・○×・理由／ポイントをすべて入力してください。"); return;
    }
    if (!confirmed) { setError("提出前の確認にチェックしてください。"); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examType: "video", candidateNumber: draft.candidateNumber, candidateName: draft.candidateName,
          startedAt: draft.startedAt, videoFindings: used }) });
      const payload = await response.json() as SubmissionReceipt & { error?: string };
      if (!response.ok) throw new Error(payload.error || "提出に失敗しました。");
      saveReceipt(payload); router.replace("/complete");
    } catch (e) { setError(e instanceof Error ? e.message : "提出に失敗しました。"); setSubmitting(false); }
  }
  if (!draft) return <ExamShell step={1} examType="video"><ExamStartForm examType="video" onStarted={begin} /></ExamShell>;
  return <ExamShell step={2} examType="video"><main className="exam-page video-answer-page">
    <div className="exam-title-row"><div><div className="eyebrow">VIDEO OBSERVATION EXAM</div><h1>動画確認試験</h1>
      <p>試験官が別途上映する映像を見て、良かった点は○、アドバイスが必要な点は×を選んでください。</p></div>
      <CandidateBadge number={draft.candidateNumber} name={draft.candidateName} /></div>
    <section className="findings-panel"><div className="panel-heading"><span>シーンごとの評価</span><small>同じ指摘を繰り返し記入する必要はありません</small></div>
      <div className="finding-list finding-table-list">
        <div className="finding-column-head" aria-hidden="true"><span>シーン</span><span>○／×</span><span>理由・ポイント</span></div>
        {findings.map((row, i) => <article className="finding-row" key={row.id}><span className="finding-number">{i + 1}</span>
          <label><span>シーン {i + 1}</span><textarea rows={3} value={row.scene} onChange={e => update(row.id, "scene", e.target.value)} placeholder="場面を短く記入" /></label>
          <label><span>○／× {i + 1}</span><select value={row.judgment} onChange={e => update(row.id, "judgment", e.target.value as VideoFinding["judgment"])}><option value="">—</option><option value="○">○</option><option value="×">×</option></select></label>
          <label><span>理由・ポイント {i + 1}</span><textarea rows={3} value={row.reason} onChange={e => update(row.id, "reason", e.target.value)} placeholder="良かった理由や、改善・指導のポイントを記入" /></label>
        </article>)}
        <button className="add-finding-button" type="button" onClick={() => setFindings(rows => [...rows, createFinding()])}><span>＋</span>記入欄を増やす</button>
      </div></section>
    <div className="final-confirmation"><label className="check-line"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>試験官の案内に従い、回答を確認しました。最終回答として提出します。</span></label></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="exam-actions"><span>再読み込み・画面を閉じると入力内容は失われます。</span><button className="primary-button" disabled={submitting} onClick={submit}>{submitting ? "回答を保存・採点しています…" : "動画試験の回答を提出する"}</button></div>
  </main></ExamShell>;
}
