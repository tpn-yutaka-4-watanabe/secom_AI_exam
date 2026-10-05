"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateBadge } from "../components/CandidateBadge";
import { ExamShell } from "../components/ExamShell";
import { ExamStartForm } from "../components/ExamStartForm";
import {
  clearExamDraft,
  loadExamDraft,
  saveReceipt,
  updateVideoDraft,
} from "../lib/client-storage";
import type { ExamDraft, SubmissionReceipt, VideoFinding, VideoPlaybackState } from "@/lib/types";

const initialRowCount = 6;

function createFinding(): VideoFinding {
  return {
    id: crypto.randomUUID(),
    scene: "",
    judgment: "",
    reason: "",
  };
}

function withInitialRows(items: VideoFinding[]) {
  const normalized: VideoFinding[] = items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    scene: item.scene ?? item.issue ?? "",
    judgment: item.judgment === "○" || item.judgment === "×" ? item.judgment : "",
    reason: item.reason ?? item.recommendation ?? "",
  }));
  while (normalized.length < initialRowCount) normalized.push(createFinding());
  return normalized;
}

function elapsedSeconds(startedAt: string) {
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
}

export default function VideoTestPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const primingRef = useRef(false);
  const playbackRef = useRef<VideoPlaybackState | null>(null);
  const preparedRef = useRef(false);
  const endedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [findings, setFindings] = useState<VideoFinding[]>([]);
  const [playback, setPlayback] = useState<VideoPlaybackState | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = loadExamDraft("video");
      setDraft(stored);
      if (stored) setFindings(withInitialRows(stored.videoFindings));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (draft && findings.length) updateVideoDraft(findings);
  }, [draft, findings]);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    preparedRef.current = prepared;
  }, [prepared]);

  useEffect(() => {
    endedRef.current = videoEnded;
  }, [videoEnded]);

  useEffect(() => {
    if (!draft) return;
    let active = true;

    async function refreshPlayback() {
      try {
        const response = await fetch("/api/video-playback", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const value = (await response.json()) as VideoPlaybackState;
        if (active) {
          playbackRef.current = value;
          setPlayback(value);
          if (!value.startedAt) {
            endedRef.current = false;
            const video = videoRef.current;
            if (video && !primingRef.current) {
              if (!video.paused) video.pause();
              video.currentTime = 0;
            }
            setVideoEnded(false);
          } else if (preparedRef.current) {
            void synchronizeVideo(value.startedAt);
          }
        }
      } catch {
        if (active) setError("一斉再生の状態を確認できません。試験官に申し出てください。");
      }
    }

    void refreshPlayback();
    const interval = window.setInterval(refreshPlayback, 1_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [draft]);

  async function synchronizeVideo(startedAt: string) {
    const video = videoRef.current;
    if (!video || !preparedRef.current || !Number.isFinite(video.duration)) return;
    const expectedTime = elapsedSeconds(startedAt);
    if (expectedTime >= video.duration) {
      video.currentTime = video.duration;
      endedRef.current = true;
      setVideoEnded(true);
      return;
    }
    if (Math.abs(video.currentTime - expectedTime) > 1.25) video.currentTime = expectedTime;
    if (video.paused) {
      try {
        await video.play();
        setError("");
      } catch {
        setError("動画を自動再生できません。試験官に申し出て、再生準備をやり直してください。");
      }
    }
  }

  function beginDraft(startedDraft: ExamDraft) {
    setDraft(startedDraft);
    setFindings(withInitialRows([]));
  }

  async function preparePlayback() {
    const video = videoRef.current;
    if (!video) return;
    setError("");
    primingRef.current = true;
    try {
      await video.play();
      video.pause();
      video.currentTime = 0;
      preparedRef.current = true;
      setPrepared(true);
      const startedAt = playbackRef.current?.startedAt;
      if (startedAt) void synchronizeVideo(startedAt);
    } catch {
      setError("再生準備に失敗しました。ブラウザーの音声再生を許可して、もう一度押してください。");
    } finally {
      primingRef.current = false;
    }
  }

  function updateFinding<K extends "scene" | "judgment" | "reason">(id: string, field: K, value: VideoFinding[K]) {
    setFindings((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addFinding() {
    setFindings((current) => [...current, createFinding()]);
  }

  function preventManualSeeking() {
    const video = videoRef.current;
    const startedAt = playbackRef.current?.startedAt;
    if (!video || !startedAt || primingRef.current || !Number.isFinite(video.duration)) return;
    const expectedTime = Math.min(elapsedSeconds(startedAt), video.duration);
    if (Math.abs(video.currentTime - expectedTime) > 1.25) video.currentTime = expectedTime;
  }

  function preventManualPause() {
    const startedAt = playbackRef.current?.startedAt;
    if (startedAt && preparedRef.current && !endedRef.current && !primingRef.current) {
      void synchronizeVideo(startedAt);
    }
  }

  async function submitVideoExam() {
    if (!draft || submitting) return;
    if (!videoEnded) {
      setError("動画が終了するまで提出できません。");
      return;
    }
    const usedRows = findings.filter((item) => item.scene.trim() || item.judgment || item.reason.trim());
    if (!usedRows.length) {
      setError("少なくとも1件、シーン・○×・理由／ポイントを入力してください。");
      return;
    }
    if (usedRows.some((item) => !item.scene.trim() || !item.judgment || !item.reason.trim())) {
      setError("記入した行はシーン・○×・理由／ポイントをすべて入力してください。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examType: "video",
          candidateNumber: draft.candidateNumber,
          candidateName: draft.candidateName,
          startedAt: draft.startedAt,
          videoFindings: usedRows.map((item) => ({
            ...item,
            scene: item.scene.trim(),
            reason: item.reason.trim(),
          })),
        }),
      });
      const payload = (await response.json()) as SubmissionReceipt & { error?: string };
      if (!response.ok) throw new Error(payload.error || "提出処理に失敗しました。");
      saveReceipt(payload);
      clearExamDraft("video");
      router.push("/complete");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "提出処理に失敗しました。");
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <ExamShell step={1} examType="video"><main className="page-loading">読み込んでいます…</main></ExamShell>;
  }

  if (!draft) {
    return (
      <ExamShell step={1} examType="video">
        <ExamStartForm examType="video" onStarted={beginDraft} />
      </ExamShell>
    );
  }

  const playbackStarted = Boolean(playback?.startedAt);
  const filledCount = findings.filter((item) => item.scene.trim() || item.judgment || item.reason.trim()).length;

  return (
    <ExamShell step={2} examType="video">
      <main className="exam-page">
        <div className="exam-title-row">
          <div>
            <div className="eyebrow">VIDEO OBSERVATION EXAM</div>
            <h1>{videoEnded ? "回答の清書・確認" : "動画確認試験"}</h1>
            <p>{videoEnded ? "シーン・○×・理由／ポイントを読み直して提出してください。" : "良かった点は○、アドバイスが必要な点は×を選び、理由やポイントを記入してください。"}</p>
          </div>
          <CandidateBadge number={draft.candidateNumber} name={draft.candidateName} />
        </div>

        <div className="video-workspace simplified">
          <section className="video-panel" aria-label="試験動画">
            <div className="panel-heading dark">
              <span>試験映像</span>
              <small>{videoEnded ? "映像は終了しました" : playbackStarted ? "一斉再生中" : "試験官の開始操作を待っています"}</small>
            </div>
            <div className="video-frame locked-video-frame">
              <video
                ref={videoRef}
                src="/training-video.mp4"
                preload="auto"
                playsInline
                disablePictureInPicture
                controlsList="nodownload noplaybackrate noremoteplayback"
                tabIndex={-1}
                onContextMenu={(event) => event.preventDefault()}
                onLoadedMetadata={() => {
                  const startedAt = playbackRef.current?.startedAt;
                  if (startedAt) void synchronizeVideo(startedAt);
                }}
                onSeeking={preventManualSeeking}
                onPause={preventManualPause}
                onEnded={() => {
                  endedRef.current = true;
                  setVideoEnded(true);
                }}
              >
                お使いのブラウザーは動画再生に対応していません。
              </video>
              {!prepared && (
                <div className="video-prepare-overlay">
                  <strong>再生準備が必要です</strong>
                  <p>試験官が一斉再生する前に、下のボタンを一度押してください。</p>
                  <button className="primary-button" type="button" onClick={preparePlayback}>再生準備を完了する</button>
                </div>
              )}
            </div>
            <div className={`playback-status ${playbackStarted ? "playing" : "waiting"}`}>
              <span className="status-dot" />
              {!prepared
                ? "再生準備を完了してください"
                : videoEnded
                  ? "映像終了・回答を清書できます"
                  : playbackStarted
                    ? "管理者による一斉再生中です"
                    : "準備完了・試験官の開始をお待ちください"}
            </div>
            <div className="video-hint">
              動画は受験者側で停止・巻き戻し・早送りできません。問題がある場合は画面を操作せず、試験官に申し出てください。
            </div>
          </section>

          <section className="findings-panel simplified-findings">
            <div className="panel-heading">
              <div>
                <span>シーンごとの評価</span>
                <small>{filledCount}件記入中</small>
              </div>
              <small>○：良かった点 ／ ×：要アドバイス</small>
            </div>

            <div className="finding-list finding-table-list">
              <div className="finding-column-head" aria-hidden="true">
                <span>シーン</span>
                <span>○／×</span>
                <span>理由・ポイント</span>
              </div>
              {findings.map((finding, index) => (
                <article className="finding-row" key={finding.id}>
                  <span className="finding-number">{String(index + 1).padStart(2, "0")}</span>
                  <label>
                    <span>シーン {index + 1}</span>
                    <textarea
                      value={finding.scene}
                      onChange={(event) => updateFinding(finding.id, "scene", event.target.value)}
                      placeholder="場面を短く記入"
                      rows={4}
                    />
                  </label>
                  <label>
                    <span>○／× {index + 1}</span>
                    <select value={finding.judgment} onChange={(event) => updateFinding(finding.id, "judgment", event.target.value as VideoFinding["judgment"])}>
                      <option value="">—</option>
                      <option value="○">○</option>
                      <option value="×">×</option>
                    </select>
                  </label>
                  <label>
                    <span>理由・ポイント {index + 1}</span>
                    <textarea
                      value={finding.reason}
                      onChange={(event) => updateFinding(finding.id, "reason", event.target.value)}
                      placeholder="良かった理由、改善が必要な理由や指導のポイントを記入"
                      rows={4}
                    />
                  </label>
                </article>
              ))}
              <button className="add-finding-button" type="button" onClick={addFinding} aria-label="記入欄を増やす">
                <span aria-hidden="true">＋</span>
                記入欄を増やす
              </button>
            </div>
          </section>
        </div>

        {videoEnded && (
          <div className="review-notice">
            <strong>映像が終了しました</strong>
            <span>記入内容を清書し、各行のシーン・○×・理由／ポイントを確認して提出してください。</span>
          </div>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="exam-actions">
          <span className="autosave-note">入力内容はこの端末に自動保存されます</span>
          <button className="primary-button submit-button" type="button" onClick={submitVideoExam} disabled={!videoEnded || submitting}>
            {submitting ? "回答を保存・採点しています…" : videoEnded ? "動画試験の回答を提出する" : "動画終了後に提出できます"}
            {!submitting && videoEnded && <span>→</span>}
          </button>
        </div>
      </main>
    </ExamShell>
  );
}
