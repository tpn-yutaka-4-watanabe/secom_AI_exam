export type VideoFinding = {
  id: string;
  time: string;
  category: string;
  issue: string;
  recommendation: string;
};

export type EmailReply = {
  to: string;
  subject: string;
  body: string;
};

export type ExamDraft = {
  candidateNumber: string;
  candidateName: string;
  startedAt: string;
  videoFindings: VideoFinding[];
  emailReply: EmailReply | null;
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

export type SubmissionRecord = {
  id: string;
  candidateNumber: string;
  candidateName: string;
  startedAt: string;
  submittedAt: string;
  overallStatus: "completed" | "grading_error";
  videoTest: {
    videoFile: string;
    findings: VideoFinding[];
  };
  emailTest: {
    receivedEmail: ReceivedEmail;
    reply: EmailReply;
  };
  grading: {
    video: GradingResult;
    email: GradingResult;
  };
};

export type SubmissionReceipt = Pick<
  SubmissionRecord,
  "id" | "candidateNumber" | "candidateName" | "submittedAt" | "overallStatus"
> & {
  videoStatus: GradingResult["status"];
  emailStatus: GradingResult["status"];
};
