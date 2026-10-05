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
};

export type GradingResult = {
  status: "completed" | "error";
  attempts: BrainAttempt[];
};

export type ReceivedEmail = {
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
};

export type EmailExamContent = ReceivedEmail & {
  updatedAt?: string;
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

export type VideoPlaybackState = {
  runId: string;
  startedAt: string | null;
  updatedAt: string;
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
    videoFile: string;
    findings: VideoFinding[];
  };
  emailTest?: {
    receivedEmail: ReceivedEmail;
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
