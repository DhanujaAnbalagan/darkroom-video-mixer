import { createFileRoute } from "@tanstack/react-router";

import { EditorWorkspace } from "@/features/editor/editor-workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VideoFlow AI — Prompt-Based Video Editor" },
      { name: "description", content: "A professional video-editing workspace with source-locked transcript edits, revision history, and a multi-track timeline." },
      { property: "og:title", content: "VideoFlow AI — Prompt-Based Video Editor" },
      { property: "og:description", content: "A professional video-editing workspace with source-locked transcript edits, revision history, and a multi-track timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorWorkspace,
});