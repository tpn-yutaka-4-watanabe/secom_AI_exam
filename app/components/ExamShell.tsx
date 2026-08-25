import Link from "next/link";
import type { ReactNode } from "react";
import type { ExamType } from "@/lib/types";

export function ExamShell({
  children,
  step,
  examType,
  compactHeader = false,
}: {
  children: ReactNode;
  step?: number;
  examType?: ExamType;
  compactHeader?: boolean;
}) {
  const steps = examType
    ? ["受験情報", examType === "video" ? "動画試験" : "メール試験", "完了"]
    : [];
  return (
    <div className="app-shell">
      <header className={compactHeader ? "site-header compact" : "site-header"}>
        <Link href="/" className="brand" aria-label="グレード4認定試験 トップ">
          <span className="brand-g">G4</span>
          <span>
            <strong>グレード4認定試験</strong>
            <small>状況把握・顧客対応</small>
          </span>
        </Link>
        <div className="exam-status">
          <span className="status-dot" />
          認定試験
        </div>
      </header>

      {examType && step && (
        <nav className="progress-nav" aria-label="試験の進行状況">
          <ol>
            {steps.map((label, index) => {
              const number = index + 1;
              const state = number < step ? "done" : number === step ? "current" : "upcoming";
              return (
                <li key={label} className={state} aria-current={number === step ? "step" : undefined}>
                  <span>{number < step ? "✓" : number}</span>
                  <small>{label}</small>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {children}
    </div>
  );
}
