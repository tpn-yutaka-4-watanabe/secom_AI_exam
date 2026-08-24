"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateBadge } from "../components/CandidateBadge";
import { ExamShell } from "../components/ExamShell";
import { loadExamDraft, updateVideoDraft } from "../lib/client-storage";
import type { ExamDraft, VideoFinding } from "@/lib/types";

const categories = ["安全配慮", "顧客対応", "情報管理", "言動・マナー", "業務手順", "その他"];

function createFinding(): VideoFinding {
  return {
    id: crypto.randomUUID(),
    time: "",
    category: "安全配慮",
    issue: "",
    recommendation: "",
  };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export default function VideoTestPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [findings, setFindings] = useState<VideoFinding[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = loadExamDraft();
      setDraft(stored);
      setFindings(stored?.videoFindings.length ? stored.videoFindings : [createFinding()]);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (draft) updateVideoDraft(findings);
  }, [draft, findings]);

  function updateFinding(id: string, field: keyof VideoFinding, value: string) {
    setFindings((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function markCurrentTime(id: string) {
    updateFinding(id, "time", formatTime(videoRef.current?.currentTime ?? 0));
  }

  function removeFinding(id: string) {
    setFindings((current) => current.length === 1 ? current : current.filter((item) => item.id !== id));
  }

  function beginReview() {
    if (!findings.some((item) => item.issue.trim())) {
      setError("少なくとも1件の指摘事項を入力してください。");
      return;
    }
    setError("");
    setReviewMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueToEmail() {
    const cleaned = findings
      .filter((item) => item.issue.trim())
      .map((item) => ({
        ...item,
        time: item.time.trim(),
        issue: item.issue.trim(),
        recommendation: item.recommendation.trim(),
      }));
    if (cleaned.some((item) => !item.recommendation)) {
      setError("すべての指摘について「あるべき対応」を入力してください。");
      return;
    }
    updateVideoDraft(cleaned);
    router.push("/email-test");
  }

  if (!draft) {
    return (
      <ExamShell step={2}>
        <main className="missing-session">
          <h1>受験情報が確認できません</h1>
          <p>試験開始画面から受験番号と氏名を入力してください。</p>
          <Link href="/" className="primary-button">開始画面へ戻る</Link>
        </main>
      </ExamShell>
    );
  }

  return (
    <ExamShell step={2}>
      <main className="exam-page">
        <div className="exam-title-row">
          <div>
            <div className="eyebrow">SECTION 01</div>
            <h1>{reviewMode ? "指摘内容の清書・確認" : "動画確認試験"}</h1>
            <p>
              {reviewMode
                ? "記録した内容を読み直し、第三者に伝わる表現へ整えてください。"
                : "映像を確認し、不適切だと考える箇所と望ましい対応を記録してください。"}
            </p>
          </div>
          <CandidateBadge number={draft.candidateNumber} name={draft.candidateName} />
        </div>

        <div className={reviewMode ? "video-workspace review" : "video-workspace"}>
          <section className="video-panel" aria-label="試験動画">
            <div className="panel-heading dark">
              <span>試験映像</span>
              <small>必要に応じて一時停止・巻き戻しができます</small>
            </div>
            <div className="video-frame">
              <video
                ref={videoRef}
                src="/training-video.mp4"
                controls
                preload="metadata"
                onEnded={() => setReviewMode(true)}
              >
                お使いのブラウザは動画再生に対応していません。
              </video>
            </div>
            <div className="video-hint">
              <span>記録のヒント</span>
              気づいた時点で動画を止め、「現在時刻」を押してから内容を入力してください。
            </div>
          </section>

          <section className="findings-panel">
            <div className="panel-heading">
              <div>
                <span>{reviewMode ? "提出する指摘事項" : "指摘事項メモ"}</span>
                <small>{findings.filter((item) => item.issue.trim()).length}件入力済み</small>
              </div>
              {!reviewMode && (
                <button className="secondary-button small" onClick={() => setFindings((current) => [...current, createFinding()])}>
                  ＋ 行を追加
                </button>
              )}
            </div>

            <div className="finding-list">
              {findings.map((finding, index) => (
                <article className="finding-card" key={finding.id}>
                  <div className="finding-card-head">
                    <strong>指摘 {String(index + 1).padStart(2, "0")}</strong>
                    {findings.length > 1 && !reviewMode && (
                      <button className="text-button danger" onClick={() => removeFinding(finding.id)} aria-label={`指摘${index + 1}を削除`}>
                        削除
                      </button>
                    )}
                  </div>
                  <div className="finding-meta">
                    <label>
                      <span>映像時刻</span>
                      <div className="time-input">
                        <input
                          value={finding.time}
                          onChange={(event) => updateFinding(finding.id, "time", event.target.value)}
                          placeholder="00:00"
                        />
                        {!reviewMode && <button onClick={() => markCurrentTime(finding.id)}>現在時刻</button>}
                      </div>
                    </label>
                    <label>
                      <span>分類</span>
                      <select value={finding.category} onChange={(event) => updateFinding(finding.id, "category", event.target.value)}>
                        {categories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>不適切だと考える箇所</span>
                    <textarea
                      value={finding.issue}
                      onChange={(event) => updateFinding(finding.id, "issue", event.target.value)}
                      placeholder="誰が読んでも状況が分かるように記載してください"
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>あるべき対応</span>
                    <textarea
                      value={finding.recommendation}
                      onChange={(event) => updateFinding(finding.id, "recommendation", event.target.value)}
                      placeholder="どのように対応すべきだったか記載してください"
                      rows={3}
                    />
                  </label>
                </article>
              ))}
            </div>
          </section>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="exam-actions">
          {reviewMode ? (
            <>
              <button className="secondary-button" onClick={() => setReviewMode(false)}>動画とメモに戻る</button>
              <button className="primary-button" onClick={continueToEmail}>内容を確定してメール試験へ <span>→</span></button>
            </>
          ) : (
            <>
              <span className="autosave-note">入力内容はこの端末に自動保存されます</span>
              <button className="primary-button" onClick={beginReview}>動画確認を終えて清書する <span>→</span></button>
            </>
          )}
        </div>
      </main>
    </ExamShell>
  );
}
