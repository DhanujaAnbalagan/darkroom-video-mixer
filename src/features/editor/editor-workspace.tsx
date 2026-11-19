import {
  Activity,
  ArrowDownToLine,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Clock3,
  Film,
  FileVideo2,
  History,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Settings2,
  Sparkles,
  Subtitles,
  Undo2,
  Upload,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import previewFrame from "@/assets/metro-cutaway.jpg";
import {
  activeWordIds,
  applyWordRemoval,
  durationAfterEdits,
  fillerWords,
  interpretDemoInstruction,
} from "./edit-engine";
import { configureApiBaseUrl, getApiBaseUrl, videoFlowApi, VideoFlowApiError } from "./api-client";
import type { EditOperation, InstructionResult, TimelineState, TranscriptWord } from "./types";

const demoWords: TranscriptWord[] = [
  { id: "w-001", startSeconds: 2.14, endSeconds: 2.48, text: "We", speakerId: "speaker-1", confidence: 0.99 },
  { id: "w-002", startSeconds: 2.49, endSeconds: 2.82, text: "followed", speakerId: "speaker-1", confidence: 0.98 },
  { id: "w-003", startSeconds: 2.83, endSeconds: 3.06, text: "the", speakerId: "speaker-1", confidence: 0.99 },
  { id: "w-004", startSeconds: 3.07, endSeconds: 3.65, text: "rain", speakerId: "speaker-1", confidence: 0.94 },
  { id: "w-005", startSeconds: 3.66, endSeconds: 3.95, text: "all", speakerId: "speaker-1", confidence: 0.98 },
  { id: "w-006", startSeconds: 3.96, endSeconds: 4.15, text: "the", speakerId: "speaker-1", confidence: 0.99 },
  { id: "w-007", startSeconds: 4.16, endSeconds: 4.82, text: "way", speakerId: "speaker-1", confidence: 0.97 },
  { id: "w-008", startSeconds: 4.83, endSeconds: 5.1, text: "home.", speakerId: "speaker-1", confidence: 0.98 },
  { id: "w-009", startSeconds: 6.72, endSeconds: 6.91, text: "Um,", speakerId: "speaker-1", confidence: 0.62 },
  { id: "w-010", startSeconds: 7.01, endSeconds: 7.42, text: "I", speakerId: "speaker-1", confidence: 0.99 },
  { id: "w-011", startSeconds: 7.43, endSeconds: 8.01, text: "remember", speakerId: "speaker-1", confidence: 0.97 },
  { id: "w-012", startSeconds: 8.02, endSeconds: 8.42, text: "that", speakerId: "speaker-1", confidence: 0.95 },
  { id: "w-013", startSeconds: 8.43, endSeconds: 9.12, text: "night.", speakerId: "speaker-1", confidence: 0.91 },
];

const initialTimeline: TimelineState = {
  sourceDurationSeconds: 31.5,
  words: demoWords,
  revisions: [],
  revisionIndex: -1,
};

type SidebarTab = "Transcript" | "AI edit" | "History" | "Export";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

function formatPreciseTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${formatTime(safe)}:${Math.floor((safe % 1) * 30).toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Waveform({ bars = 44 }: { bars?: number }) {
  return (
    <div className="flex h-full items-center gap-[2px] overflow-hidden" aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          className="w-[2px] shrink-0 rounded-sm bg-emerald-300/75"
          style={{ height: `${15 + ((index * 31 + index * index * 7) % 72)}%` }}
        />
      ))}
    </div>
  );
}

function RailButton({
  label,
  active = false,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`h-10 w-10 rounded-md ${active ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </Button>
  );
}

export function EditorWorkspace() {
  const [timeline, setTimeline] = useState(initialTimeline);
  const [transcriptLabel, setTranscriptLabel] = useState("Sample transcript · stable source word IDs");
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("Transcript");
  const [instruction, setInstruction] = useState("");
  const [instructionResult, setInstructionResult] = useState<InstructionResult | null>(null);
  const [currentTime, setCurrentTime] = useState(4.2);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<string | null>(null);
  const [sourceDuration, setSourceDuration] = useState(initialTimeline.sourceDurationSeconds);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl() ?? "");
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"demo" | "checking" | "connected" | "error">(
    getApiBaseUrl() ? "checking" : "demo",
  );
  const [backendMessage, setBackendMessage] = useState(
    getApiBaseUrl() ? "Checking API connection…" : "Demo mode · API not connected",
  );
  const [activeProjectId, setActiveProjectId] = useState("demo-project");
  const [renderMessage, setRenderMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeIds = useMemo(() => activeWordIds(timeline), [timeline]);
  const editedDuration = useMemo(() => {
    const removedIds = new Set(timeline.revisions.slice(0, timeline.revisionIndex + 1).flatMap((revision) => revision.removedWordIds));
    const removedDuration = timeline.words.reduce((total, word) => removedIds.has(word.id) ? total + word.endSeconds - word.startSeconds : total, 0);
    return Math.max(0, sourceDuration - removedDuration);
  }, [sourceDuration, timeline]);
  const progressPercent = Math.min(100, (currentTime / Math.max(1, sourceDuration)) * 100);
  const currentRevision = timeline.revisions[timeline.revisionIndex];
  const canUndo = timeline.revisionIndex >= 0;
  const canRedo = timeline.revisionIndex < timeline.revisions.length - 1;

  useEffect(() => {
    if (!videoUrl) return;
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    if (!playing || videoUrl) return;
    const interval = window.setInterval(() => {
      setCurrentTime((time) => time >= sourceDuration ? 0 : time + 0.1);
    }, 100);
    return () => window.clearInterval(interval);
  }, [playing, sourceDuration, videoUrl]);

  const handleApiCheck = async (baseUrl: string) => {
    configureApiBaseUrl(baseUrl || null);
    setApiUrl(baseUrl);
    if (!baseUrl.trim()) {
      setBackendStatus("demo");
      setBackendMessage("Demo mode · API not connected");
      setShowApiSettings(false);
      return;
    }
    setBackendStatus("checking");
    setBackendMessage("Checking API connection…");
    try {
      await videoFlowApi.health();
      setBackendStatus("connected");
      setBackendMessage("API connected");
      setShowApiSettings(false);
    } catch (error) {
      setBackendStatus("error");
      setBackendMessage(error instanceof VideoFlowApiError ? error.message : "API connection could not be verified.");
    }
  };

  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    if (baseUrl) void handleApiCheck(baseUrl);
    // Check an API URL supplied in the app configuration once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (file?: File) => {
    if (!file) return;
    const isSupported = /\.(mp4|mov)$/i.test(file.name) || ["video/mp4", "video/quicktime"].includes(file.type);
    if (!isSupported) {
      setUploadMessage("Choose an MP4 or MOV video.");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setVideoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return nextUrl;
    });
    setVideoName(file.name);
    setVideoSize(formatBytes(file.size));
    setUploadMessage("Local preview only · original file stays unchanged");
    setTranscriptLabel("No transcript · connect the API to transcribe this source");
    setTimeline({ ...initialTimeline, words: [], revisions: [], revisionIndex: -1 });
    setSelectedWordIds([]);
    setPlaying(false);
    if (!getApiBaseUrl()) return;
    setUploadMessage("Saving source to the connected API…");
    try {
      const project = await videoFlowApi.createProject({ name: file.name.replace(/\.(mp4|mov)$/i, "") });
      await videoFlowApi.upload(project.id, file);
      setActiveProjectId(project.id);
      setUploadMessage("Source uploaded · requesting transcript from the API…");
      const transcription = await videoFlowApi.transcribe(project.id);
      if (transcription.status.toLowerCase() === "failed") throw new VideoFlowApiError("The transcription service reported a failure.");
      const words = await videoFlowApi.getTranscript(project.id);
      if (words.length > 0) {
        setTimeline({
          sourceDurationSeconds: project.durationSeconds > 0 ? project.durationSeconds : sourceDuration,
          words,
          revisions: [],
          revisionIndex: -1,
        });
        setTranscriptLabel("Connected API transcript · stable source word IDs");
        setUploadMessage("Source uploaded · transcript loaded · original file is preserved");
      } else {
        setUploadMessage(`Source uploaded · transcription status: ${transcription.status}. Transcript is not available yet.`);
      }
    } catch (error) {
      setBackendStatus("error");
      setBackendMessage(error instanceof VideoFlowApiError ? error.message : "The source could not be uploaded.");
      setUploadMessage("Showing a local preview only · the source was not saved to the API");
    }
  };

  const handleMetadata = () => {
    const duration = videoRef.current?.duration;
    if (duration && Number.isFinite(duration)) {
      setSourceDuration(duration);
      setCurrentTime(0);
      setTimeline((state) => ({ ...state, sourceDurationSeconds: duration }));
    }
  };

  const seekTo = (seconds: number) => {
    const bounded = Math.min(sourceDuration, Math.max(0, seconds));
    setCurrentTime(bounded);
    if (videoRef.current) videoRef.current.currentTime = bounded;
  };

  const togglePlay = async () => {
    if (videoUrl && videoRef.current) {
      if (playing) videoRef.current.pause();
      else await videoRef.current.play().catch(() => setUploadMessage("This video could not be played in the preview."));
    }
    setPlaying((value) => !value);
  };

  const toggleWord = (wordId: string) => {
    if (!activeIds.has(wordId)) return;
    setSelectedWordIds((previous) => previous.includes(wordId) ? previous.filter((id) => id !== wordId) : [...previous, wordId]);
  };

  const runInstruction = async (command = instruction) => {
    setInstruction(command);
    if (getApiBaseUrl() && activeProjectId !== "demo-project") {
      try {
        const result = await videoFlowApi.sendInstruction(activeProjectId, command);
        setInstructionResult(result);
        if (result.status === "Applied") {
          setTimeline((state) => {
            let next = state;
            for (const operation of result.operations) {
              if (operation.type === "remove_words") {
                const applied = applyWordRemoval(next, operation.sourceWordIds, command, operation.reason);
                if (applied) next = applied.state;
              }
            }
            return next;
          });
          setSelectedWordIds([]);
        }
      } catch (error) {
        setInstructionResult({ status: "Rejected", reason: error instanceof VideoFlowApiError ? error.message : "The API could not process this instruction." });
      }
      return;
    }
    if (videoUrl && timeline.words.length === 0) {
      setInstructionResult({ status: "Rejected", reason: "This source has no transcript yet. Connect the VideoFlow API and transcribe the source before editing." });
      return;
    }
    const result = interpretDemoInstruction(command, timeline, selectedWordIds);
    if (result.kind === "clarify") {
      setInstructionResult({ status: "Needs clarification", question: result.question, options: result.options });
      return;
    }
    if (result.kind === "reject") {
      setInstructionResult({ status: "Rejected", reason: result.reason });
      return;
    }
    const applied = applyWordRemoval(timeline, result.wordIds, command, result.reason);
    if (!applied) {
      setInstructionResult({ status: "Rejected", reason: "No new transcript words matched this instruction." });
      return;
    }
    const beforeDurationSeconds = durationAfterEdits(timeline);
    setTimeline(applied.state);
    setSelectedWordIds([]);
    setInstructionResult({
      status: "Applied",
      operations: [applied.operation],
      beforeDurationSeconds,
      afterDurationSeconds: durationAfterEdits(applied.state),
      message: `Removed ${result.wordIds.length} source word${result.wordIds.length === 1 ? "" : "s"}. Original media is unchanged.`,
    });
  };

  const handleUndo = async () => {
    if (!canUndo) return;
    if (getApiBaseUrl() && activeProjectId !== "demo-project") {
      try {
        await videoFlowApi.undo(activeProjectId);
      } catch (error) {
        setBackendMessage(error instanceof VideoFlowApiError ? error.message : "Undo could not be saved to the API.");
        setBackendStatus("error");
        return;
      }
    }
    setTimeline((state) => ({ ...state, revisionIndex: state.revisionIndex - 1 }));
    setInstructionResult(null);
  };

  const handleRedo = async () => {
    if (!canRedo) return;
    if (getApiBaseUrl() && activeProjectId !== "demo-project") {
      try {
        await videoFlowApi.redo(activeProjectId);
      } catch (error) {
        setBackendMessage(error instanceof VideoFlowApiError ? error.message : "Redo could not be saved to the API.");
        setBackendStatus("error");
        return;
      }
    }
    setTimeline((state) => ({ ...state, revisionIndex: state.revisionIndex + 1 }));
    setInstructionResult(null);
  };

  const handleRestore = async (revisionIndex: number) => {
    const revision = timeline.revisions[revisionIndex];
    if (!revision) return;
    if (getApiBaseUrl() && activeProjectId !== "demo-project") {
      try {
        await videoFlowApi.restore(activeProjectId, revision.id);
      } catch (error) {
        setBackendMessage(error instanceof VideoFlowApiError ? error.message : "Restore could not be saved to the API.");
        setBackendStatus("error");
        return;
      }
    }
    setTimeline((state) => ({ ...state, revisionIndex }));
    setInstructionResult(null);
  };

  const handleRender = async () => {
    if (!getApiBaseUrl()) {
      setRenderMessage("Rendering is unavailable in demo mode. Connect the VideoFlow rendering API to create a downloadable video.");
      return;
    }
    if (activeProjectId === "demo-project") {
      setRenderMessage("Upload the source to the connected API before requesting a render.");
      return;
    }
    setRenderMessage("Requesting render from the connected API…");
    try {
      const job = await videoFlowApi.render(activeProjectId);
      setRenderMessage(`Render job ${job.id} · ${job.status}${job.progress ? ` · ${job.progress}%` : ""}`);
    } catch (error) {
      setRenderMessage(error instanceof VideoFlowApiError ? error.message : "Render request failed.");
    }
  };

  const handleOption = (option: string) => {
    const nextCommand = option === "Remove filler words" ? "Remove filler words" : "Remove selected words";
    setInstruction(nextCommand);
    void runInstruction(nextCommand);
  };

  const visibleWords = timeline.words.filter((word) => activeIds.has(word.id));
  const transcriptBySource = timeline.words;
  const instructionHistory = timeline.revisions;
  const cutOperationCount = instructionHistory.slice(0, timeline.revisionIndex + 1).reduce((total, revision) => total + revision.operations.length, 0);

  return (
    <main className="editor-shell flex h-[100svh] min-h-[680px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-4">
          <a className="flex shrink-0 items-center gap-2.5" href="/" aria-label="VideoFlow home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Clapperboard className="h-[17px] w-[17px]" /></span>
            <span className="text-[14px] font-semibold">VideoFlow<span className="font-normal text-muted-foreground"> AI</span></span>
          </a>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="hidden text-muted-foreground sm:inline">Projects</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="truncate font-medium">Midnight in Montmartre</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="ml-1 hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline">DEMO</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowApiSettings(true)} className="hidden h-8 gap-2 px-2.5 text-xs text-muted-foreground sm:inline-flex">
            <span className={`h-1.5 w-1.5 rounded-full ${backendStatus === "connected" ? "bg-emerald-500" : backendStatus === "error" ? "bg-destructive" : "bg-amber-400"}`} />
            <span className="max-w-[138px] truncate">{backendStatus === "connected" ? "API connected" : backendStatus === "error" ? "API unavailable" : "Demo mode"}</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSidebarTab("History")} className="h-8 gap-1.5 border-border px-2.5 text-xs sm:px-3">
            <History className="h-3.5 w-3.5" /><span className="hidden sm:inline">History</span>
          </Button>
          <Button type="button" size="sm" onClick={() => { setSidebarTab("Export"); void handleRender(); }} className="h-8 gap-1.5 rounded-md px-2.5 text-xs sm:px-3">
            <ArrowDownToLine className="h-3.5 w-3.5" /><span>Export</span>
          </Button>
        </div>
      </header>

      {backendStatus === "error" && (
        <div role="status" className="flex min-h-8 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          <span className="flex min-w-0 items-center gap-2"><CircleHelp className="h-3.5 w-3.5 shrink-0" /><span className="truncate">API unavailable · {backendMessage}</span></span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowApiSettings(true)} className="h-6 shrink-0 px-2 text-xs">Settings</Button>
        </div>
      )}

        <div className="editor-columns flex min-h-0 flex-1">
        <nav className="hidden w-[54px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3 md:flex" aria-label="Editor tools">
          <RailButton label="Selection tool" active><MousePointer2 /></RailButton>
          <RailButton label="Split tool"><Scissors /></RailButton>
          <RailButton label="Video track"><Film /></RailButton>
          <RailButton label="Audio track"><AudioLines /></RailButton>
          <RailButton label="Captions"><Subtitles /></RailButton>
          <div className="my-2 h-px w-6 bg-border" />
          <RailButton label="Settings" onClick={() => setShowApiSettings(true)}><Settings2 /></RailButton>
          <div className="mt-auto"><RailButton label="Help"><CircleHelp /></RailButton></div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
          <section className="editor-main-column flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-[43px] shrink-0 items-center justify-between border-b border-border bg-background px-3 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-foreground">Editor</span>
                <span className="text-[11px] text-muted-foreground">1080p · 24 fps</span>
                    <span className="hidden items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex"><Clock3 className="h-3 w-3" />Source time</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleUndo} disabled={!canUndo} title="Undo" aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleRedo} disabled={!canRedo} title="Redo" aria-label="Redo"><Redo2 className="h-4 w-4" /></Button>
                <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
                <span className="hidden text-[11px] text-muted-foreground sm:inline">{currentRevision ? "Unsaved edits" : "All changes saved locally"}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="More editor options" title="More editor options"><MoreHorizontal className="h-4 w-4" /></Button>
              </div>
            </div>

            <section className="editor-preview flex min-h-[260px] flex-1 flex-col items-center justify-center overflow-hidden bg-preview-canvas px-3 py-4 sm:px-7" aria-label="Video preview">
              <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
                <div className="editor-preview-frame relative overflow-hidden bg-preview-canvas shadow-2xl">
                  {videoUrl ? (
                    <video ref={videoRef} src={videoUrl} className="h-full w-full object-contain" onLoadedMetadata={handleMetadata} onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
                  ) : (
                    <img src={previewFrame} alt="Rainy Paris street from the sample editing project" width={1280} height={720} className="h-full w-full object-cover" />
                  )}
                  {!videoUrl && <div className="absolute left-3 top-3 rounded bg-preview-overlay px-2 py-1 text-[10px] font-medium text-preview-overlay-foreground">SAMPLE FRAME · NOT A VIDEO FILE</div>}
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                    {!videoUrl && <p className="max-w-[82%] rounded-sm bg-preview-overlay px-3 py-1.5 text-sm font-medium text-preview-overlay-foreground shadow">We followed the rain all the way home.</p>}
                    <span className="shrink-0 rounded-sm bg-preview-overlay px-1.5 py-1 text-[11px] tabular-nums text-preview-overlay-foreground">{formatTime(currentTime)}</span>
                  </div>
                </div>
                {!videoUrl && (
                  <div className="absolute right-3 top-3 sm:right-5 sm:top-4">
                    <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} className="h-8 gap-2 border border-border/60 bg-card/90 text-xs shadow-md hover:bg-card">
                      <Upload className="h-3.5 w-3.5" /><span>Replace source</span>
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex w-full max-w-5xl items-center justify-between gap-3 pt-3">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">{videoName ? <><FileVideo2 className="mr-1.5 inline h-3.5 w-3.5" />{videoName} · {videoSize}</> : "Sample project · original footage preserved"}</span>
                <div className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  {videoName && <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-7 w-7 text-muted-foreground" title="Replace source video" aria-label="Replace source video"><Upload className="h-3.5 w-3.5" /></Button>}
                  <span>{formatPreciseTime(currentTime)}</span>
                  <Button type="button" size="icon" variant="secondary" onClick={() => void togglePlay()} className="h-8 w-8" title={playing ? "Pause preview" : "Play preview"} aria-label={playing ? "Pause preview" : "Play preview"}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => videoRef.current && (videoRef.current.muted = !videoRef.current.muted)} className="hidden h-7 w-7 sm:inline-flex" title="Toggle preview audio" aria-label="Toggle preview audio"><Volume2 className="h-4 w-4" /></Button>
                  <span className="hidden sm:inline">{formatPreciseTime(sourceDuration)}</span>
                </div>
              </div>
              {uploadMessage && <div className="mt-2 w-full max-w-5xl truncate text-[11px] text-muted-foreground" role="status">{uploadMessage}</div>}
            </section>

            <section className="editor-timeline timeline-shell flex h-[326px] shrink-0 flex-col border-t border-border bg-card" aria-label="Multi-track timeline">
              <div className="flex h-[43px] shrink-0 items-center justify-between border-b border-border px-3 sm:px-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xs font-medium">Timeline</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{formatTime(editedDuration)} total</span>
                  <span className="hidden text-[10px] text-muted-foreground md:inline">Edits reference original source time</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((value) => Math.max(0.7, value - 0.2))} title="Zoom out timeline" aria-label="Zoom out timeline"><ZoomOut className="h-3.5 w-3.5" /></Button>
                  <span className="w-9 text-center text-[10px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((value) => Math.min(1.8, value + 0.2))} title="Zoom in timeline" aria-label="Zoom in timeline"><ZoomIn className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="ml-1 h-7 w-7" title="Timeline options" aria-label="Timeline options"><MoreHorizontal className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="z-10 flex w-[94px] shrink-0 flex-col border-r border-border bg-card sm:w-[128px]">
                  <div className="h-7 shrink-0 border-b border-border" />
                  <TrackLabel title="VIDEO 01" detail={videoName ? "Local source" : "Sample source"} icon={<Film className="h-3.5 w-3.5" />} color="text-sky-300" />
                  <TrackLabel title="AUDIO 01" detail="Source audio" icon={<AudioLines className="h-3.5 w-3.5" />} color="text-emerald-300" />
                  <TrackLabel title="CAPTIONS" detail="Transcript" icon={<Subtitles className="h-3.5 w-3.5" />} color="text-amber-300" />
                  <div className="flex min-h-[34px] items-center gap-2 border-t border-border/70 px-2 text-[10px] text-muted-foreground sm:px-3"><Plus className="h-3 w-3" /><span className="hidden sm:inline">Add track</span></div>
                </div>

                <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                  <div className="relative h-full" style={{ width: `${Math.max(100, 100 * zoom)}%`, minWidth: "540px" }} onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const fraction = (event.clientX - bounds.left) / bounds.width;
                    seekTo(fraction * sourceDuration);
                  }}>
                    <div className="relative h-7 border-b border-border bg-card/80">
                      {Array.from({ length: 7 }, (_, index) => (
                        <div key={index} className="absolute top-0 h-full" style={{ left: `${(index / 6) * 100}%` }}>
                          <span className="absolute left-1 top-[6px] text-[9px] tabular-nums text-muted-foreground">{formatTime((sourceDuration * index) / 6)}</span>
                          <span className="absolute bottom-0 left-0 h-1.5 w-px bg-muted-foreground/50" />
                        </div>
                      ))}
                    </div>

                    <div className="relative h-[68px] border-b border-border/70 bg-background/40 p-1.5">
                      <div className="flex h-full gap-[3px] overflow-hidden rounded-sm">
                        {[
                          { left: 0, width: 36, title: "01 · Rue des Martyrs", start: 0, end: 11 },
                          { left: 36, width: 36, title: "02 · After the rain", start: 11, end: 22 },
                          { left: 72, width: 28, title: "03 · Last train home", start: 22, end: 31.5 },
                        ].map((clip, index) => {
                          const clipWords = transcriptBySource.filter((word) => word.startSeconds >= clip.start && word.startSeconds < clip.end);
                          const removedClip = clipWords.some((word) => !activeIds.has(word.id));
                          return (
                            <div key={clip.title} className={`absolute top-1.5 h-[60px] overflow-hidden rounded-[3px] border ${removedClip ? "border-dashed border-destructive/60 opacity-60" : "border-sky-400/35"}`} style={{ left: `${clip.left}%`, width: `${clip.width}%` }}>
                              <div className="absolute inset-0 grid grid-cols-4 opacity-55">
                                {Array.from({ length: 4 }, (_, frame) => <img key={frame} src={previewFrame} alt="" loading="lazy" width={1280} height={720} className="h-full w-full object-cover" />)}
                              </div>
                              <div className="absolute inset-0 bg-timeline-video/20" />
                              <span className="absolute left-1 top-1 rounded bg-preview-overlay px-1 py-0.5 text-[9px] font-medium text-preview-overlay-foreground">{clip.title}</span>
                              {removedClip && <span className="absolute bottom-1 right-1 rounded bg-destructive/85 px-1 py-0.5 text-[8px] font-semibold text-destructive-foreground">EDITED</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="relative h-[64px] border-b border-border/70 bg-background/40 p-1.5">
                      <div className="absolute left-0 top-1.5 h-[53px] overflow-hidden rounded-sm border border-emerald-400/25 bg-emerald-950/25" style={{ width: "99%" }}>
                        <div className="absolute inset-x-0 top-0 h-1/2 opacity-80"><Waveform /></div>
                        <div className="absolute inset-x-0 bottom-0 h-1/2 opacity-55"><Waveform /></div>
                        {timeline.revisions.slice(0, timeline.revisionIndex + 1).flatMap((revision) => revision.removedWordIds.map((wordId) => timeline.words.find((word) => word.id === wordId))).filter((word): word is TranscriptWord => Boolean(word)).map((word) => (
                          <span key={word.id} className="absolute inset-y-0 border-x border-destructive/70 bg-destructive/25" style={{ left: `${(word.startSeconds / sourceDuration) * 100}%`, width: `${((word.endSeconds - word.startSeconds) / sourceDuration) * 100}%` }} title={`Removed source word: ${word.text}`} />
                        ))}
                      </div>
                    </div>

                    <div className="relative h-[48px] border-b border-border/70 bg-background/40 p-1.5">
                      {timeline.words.filter((word) => activeIds.has(word.id)).map((word) => (
                        <span key={word.id} className="absolute top-2 h-[29px] overflow-hidden rounded-[3px] border border-amber-400/30 bg-amber-500/10 px-1.5 pt-1 text-[9px] text-amber-100/90" style={{ left: `${(word.startSeconds / sourceDuration) * 100}%`, width: `${Math.max(3.3, ((word.endSeconds - word.startSeconds) / sourceDuration) * 100)}%` }}>{word.text}</span>
                      ))}
                    </div>

                    <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary" style={{ left: `${progressPercent}%` }}>
                      <span className="absolute top-[25px] -left-[4px] h-2 w-2 rotate-45 bg-primary" />
                      <span className="absolute top-[32px] -left-[4px] bottom-0 w-2 border-l border-primary/50" />
                    </div>
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-6">
                      {Array.from({ length: 6 }, (_, index) => <span key={index} className="border-l border-border/15" />)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex h-[33px] shrink-0 items-center justify-between border-t border-border px-3 text-[10px] text-muted-foreground sm:px-4">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{cutOperationCount} {cutOperationCount === 1 ? "edit" : "edits"} · {timeline.words.length - activeIds.size} word segments removed</span>
                <span className="hidden sm:inline">Source-locked timeline</span>
              </div>
            </section>
          </section>

          <aside className="editor-panels flex min-h-[300px] w-full shrink-0 flex-col border-t border-border bg-card xl:min-h-0 xl:w-[348px] xl:border-l xl:border-t-0 2xl:w-[372px]" aria-label="Editing panels">
            <div className="flex h-[43px] shrink-0 items-end gap-1 overflow-x-auto border-b border-border px-2">
              {([
                ["Transcript", <MessageSquareText key="transcript-icon" className="h-3.5 w-3.5" />],
                ["AI edit", <Sparkles key="ai-icon" className="h-3.5 w-3.5" />],
                ["History", <History key="history-icon" className="h-3.5 w-3.5" />],
                ["Export", <ArrowDownToLine key="export-icon" className="h-3.5 w-3.5" />],
              ] as const).map(([label, icon]) => (
                <Button key={label} type="button" variant="ghost" size="sm" onClick={() => setSidebarTab(label)} className={`h-[42px] shrink-0 gap-1.5 rounded-none border-b-2 px-2 text-[11px] sm:px-2.5 ${sidebarTab === label ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{icon}{label}</Button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {sidebarTab === "Transcript" && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-4">
                    <div><h2 className="text-sm font-semibold">Transcript</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{transcriptLabel}</p></div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Transcript options" aria-label="Transcript options"><MoreHorizontal className="h-4 w-4" /></Button>
                  </div>
                  {timeline.words.length > 0 && <div className="mx-4 flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" /><span>Low-confidence words are underlined. Select words to target them with an edit.</span></div>}
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {timeline.words.length === 0 ? <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground">{videoUrl ? "No transcript is available for this source. Connect the VideoFlow API and upload it for transcription." : "No transcript words available."}</p> : <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="rounded-sm bg-secondary px-1.5 py-0.5 text-secondary-foreground">SPEAKER 01</span><span>{formatTime(timeline.words[0]?.startSeconds ?? 0)} – {formatTime(timeline.words.at(-1)?.endSeconds ?? 0)} source time</span></div>}
                    <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 text-[13px] leading-6">
                      {timeline.words.map((word) => {
                        const removed = !activeIds.has(word.id);
                        const selected = selectedWordIds.includes(word.id);
                        const low = word.confidence < 0.75;
                        return (
                          <Button key={word.id} type="button" variant="ghost" size="sm" disabled={removed} onClick={() => { toggleWord(word.id); seekTo(word.startSeconds); }} title={`${word.id} · source ${formatPreciseTime(word.startSeconds)}–${formatPreciseTime(word.endSeconds)} · confidence ${word.confidence.toFixed(2)}`} className={`h-auto min-h-0 rounded-sm px-1 py-0 text-[13px] leading-6 transition-colors disabled:cursor-not-allowed ${removed ? "text-muted-foreground/45 line-through decoration-destructive/70" : selected ? "bg-primary/20 text-foreground ring-1 ring-primary/60" : "text-foreground hover:bg-accent"} ${low ? "decoration-wavy underline decoration-warning decoration-1 underline-offset-4" : ""}`}>{word.text}</Button>
                        );
                      })}
                    </div>
                    {visibleWords.length === 0 && <p className="text-xs text-muted-foreground">All sample words are currently removed.</p>}
                  </div>
                  <div className="shrink-0 border-t border-border p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{selectedWordIds.length} selected</span><span>Original source time</span></div>
                    <Button type="button" variant="outline" disabled={selectedWordIds.length === 0} onClick={() => { setInstruction("Remove selected words"); setSidebarTab("AI edit"); }} className="h-8 w-full gap-2 text-xs"><Scissors className="h-3.5 w-3.5" />Remove selected words</Button>
                  </div>
                </div>
              )}

              {sidebarTab === "AI edit" && (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  <div className="px-4 pb-3 pt-4"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold">Prompt edit</h2><p className="text-[10px] text-muted-foreground">Deterministic sample rules · not an AI model</p></div></div></div>
                  <div className="mx-4 mb-3 rounded-md border border-border bg-background/50 p-3">
                    <p className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">Try a command</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Remove filler words", "Remove selected words", "Cut the beginning"].map((example) => <Button key={example} type="button" variant="outline" size="sm" onClick={() => setInstruction(example)} className="h-7 rounded-sm px-2 text-[10px]">{example}</Button>)}
                    </div>
                  </div>
                  <div className="px-4">
                    <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe a transcript edit…" className="min-h-[84px] resize-none rounded-md border-border bg-background text-xs leading-5 placeholder:text-muted-foreground/70" />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">Time references use original source time.</span>
                      <Button type="button" size="sm" onClick={() => void runInstruction()} disabled={!instruction.trim()} className="h-8 gap-2 px-3 text-xs"><Sparkles className="h-3.5 w-3.5" />Run edit</Button>
                    </div>
                  </div>
                  {instructionResult && <InstructionResultView result={instructionResult} onOption={handleOption} />}
                  <div className="mx-4 mb-4 mt-3 border-t border-border pt-3 text-[10px] leading-4 text-muted-foreground">Destructive and ambiguous requests are never applied without a specific transcript target. This demo changes timeline data only; it does not render video.</div>
                </div>
              )}

              {sidebarTab === "History" && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between px-4 pb-3 pt-4"><div><h2 className="text-sm font-semibold">Edit history</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{instructionHistory.length} {instructionHistory.length === 1 ? "revision" : "revisions"} · original preserved</p></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => void handleUndo()} disabled={!canUndo} className="h-7 w-7" aria-label="Undo edit" title="Undo"><Undo2 className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => void handleRedo()} disabled={!canRedo} className="h-7 w-7" aria-label="Redo edit" title="Redo"><Redo2 className="h-3.5 w-3.5" /></Button></div></div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                    <div className="relative space-y-2 border-l border-border pl-4">
                      <div className={`relative rounded-md border p-3 ${timeline.revisionIndex === -1 ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"}`}><span className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-card ${timeline.revisionIndex === -1 ? "bg-primary" : "bg-muted-foreground"}`} /><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Original source</span>{timeline.revisionIndex === -1 && <span className="text-[9px] font-medium text-primary">CURRENT</span>}</div><p className="mt-1 text-[10px] text-muted-foreground">{formatPreciseTime(sourceDuration)} · unchanged</p></div>
                      {instructionHistory.map((revision, index) => <div key={revision.id} className={`relative rounded-md border p-3 ${timeline.revisionIndex === index ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"}`}><span className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-card ${timeline.revisionIndex === index ? "bg-primary" : "bg-muted-foreground"}`} /><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-medium">{revision.instruction}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{revision.operations.map((operation) => operation.reason).join(" · ")}</p></div>{timeline.revisionIndex === index ? <span className="shrink-0 text-[9px] font-medium text-primary">CURRENT</span> : <Button type="button" variant="outline" size="sm" onClick={() => void handleRestore(index)} className="h-6 shrink-0 px-2 text-[10px]">Restore</Button>}</div><p className="mt-2 text-[9px] text-muted-foreground">Revision {index + 1} · {revision.removedWordIds.length} source word{revision.removedWordIds.length === 1 ? "" : "s"}</p></div>)}
                      {instructionHistory.length === 0 && <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">Accepted instructions will be recorded as individual revisions here.</div>}
                    </div>
                  </div>
                  <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">New edits after undo start a new branch. Original media is never overwritten.</div>
                </div>
              )}

              {sidebarTab === "Export" && (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
                  <div className="pb-3 pt-4"><h2 className="text-sm font-semibold">Export video</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Render service required · FFmpeg output</p></div>
                  <div className="rounded-md border border-border bg-background/50 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium"><span className={`h-1.5 w-1.5 rounded-full ${backendStatus === "connected" ? "bg-emerald-500" : "bg-amber-400"}`} />{backendStatus === "connected" ? "Rendering API connected" : "Demo mode · no render service"}</div>
                    <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{backendStatus === "connected" ? "The configured API will provide the actual FFmpeg output and render manifest." : "No video will be rendered here. Connect a VideoFlow API to export an edited video."}</p>
                    <Button type="button" onClick={() => void handleRender()} className="mt-3 h-8 w-full gap-2 text-xs"><ArrowDownToLine className="h-3.5 w-3.5" />Request render</Button>
                    {renderMessage && <p role="status" className="mt-2 break-words text-[10px] leading-4 text-muted-foreground">{renderMessage}</p>}
                  </div>
                  <div className="mt-4 space-y-2.5 border-t border-border pt-3">
                    <h3 className="text-[10px] font-medium uppercase text-muted-foreground">Output settings</h3>
                    <OutputRow label="Format" value="MP4 · H.264" />
                    <OutputRow label="Resolution" value="1920 × 1080" />
                    <OutputRow label="Frame rate" value="24 fps" />
                    <OutputRow label="Edited duration" value={formatPreciseTime(editedDuration)} />
                    <OutputRow label="Source duration" value={formatPreciseTime(sourceDuration)} />
                    <OutputRow label="Render job" value="Not started" />
                  </div>
                  <div className="mt-4 rounded-md border border-dashed border-border px-3 py-3 text-[10px] leading-4 text-muted-foreground">Output manifest and download link will appear here after the connected render service returns them. No completed render is being claimed.</div>
                </div>
              )}
            </div>
            <div className="flex h-[31px] shrink-0 items-center justify-between border-t border-border px-3 text-[9px] text-muted-foreground"><span>{backendStatus === "connected" ? "Connected API" : "Local demo workspace"}</span><span>Original source · {formatTime(sourceDuration)}</span></div>
          </aside>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="sr-only" aria-label="Upload an MP4 or MOV source video" onChange={(event) => void handleFile(event.target.files?.[0])} />

      {showApiSettings && <ApiSettingsDialog value={apiUrl} status={backendStatus} message={backendMessage} onValueChange={setApiUrl} onCheck={() => void handleApiCheck(apiUrl)} onClose={() => setShowApiSettings(false)} />}
      <div className="sr-only" aria-live="polite">{backendMessage}</div>
    </main>
  );
}

function TrackLabel({ title, detail, icon, color }: { title: string; detail: string; icon: React.ReactNode; color: string }) {
  return <div className="flex h-[68px] shrink-0 flex-col justify-center gap-1 border-b border-border/70 px-2 sm:px-3"><div className={`flex items-center gap-1.5 text-[9px] font-semibold tracking-wide sm:text-[10px] ${color}`}>{icon}<span>{title}</span></div><span className="truncate pl-5 text-[9px] text-muted-foreground">{detail}</span></div>;
}

function InstructionResultView({ result, onOption }: { result: InstructionResult; onOption: (option: string) => void }) {
  const tones = {
    Applied: "border-emerald-400/25 bg-emerald-400/5 text-emerald-300",
    "Needs clarification": "border-amber-400/25 bg-amber-400/5 text-amber-200",
    Rejected: "border-destructive/30 bg-destructive/5 text-destructive",
  } as const;
  return (
    <div className={`mx-4 mt-4 rounded-md border p-3 ${tones[result.status]}`} role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs font-semibold">{result.status === "Applied" ? <Check className="h-3.5 w-3.5" /> : result.status === "Rejected" ? <X className="h-3.5 w-3.5" /> : <CircleHelp className="h-3.5 w-3.5" />}{result.status}</div>
      {result.status === "Applied" && <><p className="mt-2 text-[10px] leading-4 text-foreground/80">{result.message}</p><p className="mt-2 break-words text-[10px] leading-4 text-muted-foreground">{result.operations.map((operation: EditOperation) => operation.type === "remove_words" ? `Remove source words: ${operation.sourceWordIds.join(", ")}` : `Remove source range ${formatPreciseTime(operation.sourceStartSeconds)}–${formatPreciseTime(operation.sourceEndSeconds)}`).join(" · ")}</p><p className="mt-2 text-[10px] tabular-nums text-muted-foreground">{formatPreciseTime(result.beforeDurationSeconds)} → {formatPreciseTime(result.afterDurationSeconds)}</p></>}
      {result.status === "Needs clarification" && <><p className="mt-2 text-[10px] leading-4 text-foreground/80">{result.question}</p><div className="mt-2 flex flex-wrap gap-1.5">{result.options.map((option) => <Button key={option} type="button" variant="outline" size="sm" onClick={() => onOption(option)} className="h-7 border-amber-400/25 px-2 text-[10px]">{option}</Button>)}</div></>}
      {result.status === "Rejected" && <p className="mt-2 break-words text-[10px] leading-4 text-foreground/80">{result.reason}</p>}
    </div>
  );
}

function OutputRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-[10px]"><span className="text-muted-foreground">{label}</span><span className="text-right tabular-nums text-foreground/80">{value}</span></div>;
}

function ApiSettingsDialog({
  value,
  status,
  message,
  onValueChange,
  onCheck,
  onClose,
}: {
  value: string;
  status: "demo" | "checking" | "connected" | "error";
  message: string;
  onValueChange: (value: string) => void;
  onCheck: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="api-dialog-title" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="api-dialog-title" className="text-base font-semibold">VideoFlow API</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Connect your API service for project uploads, instruction processing, and actual video rendering.</p></div><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close API settings" className="-mr-2 -mt-2 h-8 w-8"><X className="h-4 w-4" /></Button></div>
        <label htmlFor="api-base-url" className="mt-5 block text-xs font-medium">API base URL</label>
        <Input id="api-base-url" type="url" value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="https://your-api.example.com" className="mt-2 h-9 bg-background text-xs" />
        <p className="mt-2 flex items-center gap-1.5 text-[10px] leading-4 text-muted-foreground"><Link2 className="h-3 w-3 shrink-0" />Configure a base URL that provides the /api/v1/ endpoints.</p>
        <div role="status" className={`mt-4 rounded-md border px-3 py-2 text-[11px] leading-4 ${status === "error" ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border bg-background/60 text-muted-foreground"}`}>{status === "checking" && <Activity className="mr-1.5 inline h-3 w-3 animate-pulse" />}{message}</div>
        <div className="mt-5 flex items-center justify-between"><Button type="button" variant="ghost" size="sm" onClick={() => onValueChange("")} className="h-8 px-2 text-xs">Stay in demo mode</Button><Button type="button" size="sm" onClick={onCheck} disabled={status === "checking"} className="h-8 gap-2 text-xs"><Link2 className="h-3.5 w-3.5" />{status === "connected" ? "Reconnect" : "Test connection"}</Button></div>
      </section>
    </div>
  );
}