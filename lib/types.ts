export type ExamType = "video" | "email";

export type VideoFinding = {
  id: string;
  scene: string;
  judgment: "" | "○" | "×";
  reason: string;
  issue?: string;
  recommendation?: string;
  time?: string;
  category?: string;
};

export type EmailReply = {
  to: string;
  subject: string;
  body: string;
};

export type BrainAttempt = {
  attempt: number;
  status: "success" | "error";
  startedAt: string;
  completedAt: string;
  message?: string;
  response?: unknown;
  error?: string;
  httpStatus?: number;
  evaluation?: Evaluation;
  validationError?: string;
};

export type ScoreItem = { id: string; name: string; maxScore: number; score: number; comment: string; evidence?: string[] };
export type Deduction = { id: string; points: number; evidence: string; comment: string; ngHitIds: string[] };
export type Evaluation = {
  rubricVersion: string;
  score: number;
  maxScore: number;
  criteria: ScoreItem[];
  deductions: Deduction[];
  summary: string;
  needsReview: boolean;
  reviewReasons: string[];
  ngDecisions?: { hitId: string; decision: "deduct" | "allow" | "review"; comment: string }[];
};
export type NgHit = { id: string; ruleId: string; term: string; line: number; context: string; signatureCandidate: boolean; note: string };
export type EmailScenario = { id: string; title: string; situation: string; request: string; version: string; enabled: boolean };

export type GradingResult = {
  status: "completed" | "error";
  attempts: BrainAttempt[];
  summary?: GradingSummary;
};
export type GradingSummary = {
  scores: (number | null)[];
  score: number | null;
  selectedAttempt: number | null;
  method: "mode" | "median" | "incomplete";
  needsReview: boolean;
};

export type ReceivedEmail = {
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
};

export type ExamDraft = {
  examType: ExamType;
  candidateNumber: string;
  candidateName: string;
  startedAt: string;
  videoFindings: VideoFinding[];
  emailReply: EmailReply | null;
  receivedEmail?: ReceivedEmail;
};

export type SubmissionRecord = {
  id: string;
  examType?: ExamType;
  candidateNumber: string;
  candidateName: string;
  startedAt: string;
  submittedAt: string;
  overallStatus: "completed" | "grading_error";
  videoTest?: {
    videoFile?: string;
    findings: VideoFinding[];
  };
  emailTest?: {
    receivedEmail?: ReceivedEmail;
    scenario?: EmailScenario;
    ngHits?: NgHit[];
    reply: EmailReply;
  };
  grading: {
    video?: GradingResult;
    email?: GradingResult;
  };
};

export type SubmissionReceipt = Pick<
  SubmissionRecord,
  "id" | "candidateNumber" | "candidateName" | "submittedAt" | "overallStatus"
> & {
  examType: ExamType;
  gradingStatus: GradingResult["status"];
};
