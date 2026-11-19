export type ProjectStatus = "draft" | "processing" | "ready" | "failed";

export type Project = {
  id: string;
  name: string;
  status: ProjectStatus;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptWord = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  speakerId: string | null;
  confidence: number;
};

export type TimelineSegment = {
  id: string;
  trackId: "video" | "audio" | "captions";
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  sourceWordIds: string[];
  label: string;
};

export type EditOperation =
  | { type: "remove_words"; sourceWordIds: string[]; reason: string }
  | { type: "remove_source_range"; sourceStartSeconds: number; sourceEndSeconds: number; reason: string };

export type EditRevision = {
  id: string;
  parentId: string | null;
  instruction: string;
  operations: EditOperation[];
  removedWordIds: string[];
  createdAt: string;
};

export type InstructionResult =
  | {
      status: "Applied";
      operations: EditOperation[];
      beforeDurationSeconds: number;
      afterDurationSeconds: number;
      message: string;
    }
  | {
      status: "Needs clarification";
      question: string;
      options: string[];
    }
  | { status: "Rejected"; reason: string };

export type RenderJob = {
  id: string;
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  outputUrl?: string;
  error?: string;
};

export type OutputManifest = {
  jobId: string;
  fileName: string;
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string;
  createdAt: string;
};

export type TimelineState = {
  sourceDurationSeconds: number;
  words: TranscriptWord[];
  revisions: EditRevision[];
  revisionIndex: number;
};