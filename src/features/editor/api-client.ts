import type {
  EditRevision,
  InstructionResult,
  OutputManifest,
  Project,
  RenderJob,
  TimelineSegment,
  TranscriptWord,
} from "./types";

const configuredBaseUrl = import.meta.env["VITE_VIDEOFLOW_API_BASE_URL"]?.trim();
let configuredApiBaseUrl = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, "") : null;

export function configureApiBaseUrl(value: string | null): void {
  configuredApiBaseUrl = value?.trim().replace(/\/$/, "") || null;
}

export function getApiBaseUrl(): string | null {
  return configuredApiBaseUrl;
}

export class VideoFlowApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "VideoFlowApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!configuredApiBaseUrl) throw new VideoFlowApiError("No VideoFlow API URL is configured.");
  let response: Response;
  try {
    response = await fetch(`${configuredApiBaseUrl}${path}`, init);
  } catch {
    throw new VideoFlowApiError("The VideoFlow API could not be reached. Check the service URL and try again.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new VideoFlowApiError(detail || `VideoFlow API request failed (${response.status}).`, response.status);
  }
  return (await response.json()) as T;
}

const projectPath = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}`;

export const videoFlowApi = {
  createProject: (input: { name: string }) =>
    request<Project>("/api/v1/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  upload: (projectId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<Project>(`${projectPath(projectId)}/upload`, { method: "POST", body: form });
  },
  transcribe: (projectId: string) => request<{ status: string }>(`${projectPath(projectId)}/transcribe`, { method: "POST" }),
  getTranscript: (projectId: string) => request<TranscriptWord[]>(`${projectPath(projectId)}/transcript`),
  sendInstruction: (projectId: string, instruction: string) =>
    request<InstructionResult>(`${projectPath(projectId)}/instructions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction }),
    }),
  getTimeline: (projectId: string) => request<TimelineSegment[]>(`${projectPath(projectId)}/timeline`),
  undo: (projectId: string) => request<EditRevision>(`${projectPath(projectId)}/undo`, { method: "POST" }),
  redo: (projectId: string) => request<EditRevision>(`${projectPath(projectId)}/redo`, { method: "POST" }),
  restore: (projectId: string, revisionId: string) =>
    request<EditRevision>(`${projectPath(projectId)}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision_id: revisionId }),
    }),
  render: (projectId: string) => request<RenderJob>(`${projectPath(projectId)}/render`, { method: "POST" }),
  getJob: (jobId: string) => request<RenderJob>(`/api/v1/jobs/${encodeURIComponent(jobId)}`),
  health: () => request<{ status: string }>("/health"),
  ready: () => request<{ status: string }>("/ready"),
};

export type { OutputManifest };