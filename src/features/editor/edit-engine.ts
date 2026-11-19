import type { EditOperation, EditRevision, TimelineState, TranscriptWord } from "./types";

export const fillerWords = new Set(["um", "uh", "erm", "uhh", "umm"]);

export function durationAfterEdits(state: TimelineState): number {
  const removed = new Set(state.revisions.slice(0, state.revisionIndex + 1).flatMap((revision) => revision.removedWordIds));
  const removedSeconds = state.words.reduce((total, word) => {
    return removed.has(word.id) ? total + word.endSeconds - word.startSeconds : total;
  }, 0);
  return Math.max(0, state.sourceDurationSeconds - removedSeconds);
}

export function applyWordRemoval(
  state: TimelineState,
  sourceWordIds: string[],
  instruction: string,
  reason: string,
  now = new Date().toISOString(),
): { state: TimelineState; operation: EditOperation } | null {
  const activeRevisions = state.revisions.slice(0, state.revisionIndex + 1);
  const alreadyRemoved = new Set(activeRevisions.flatMap((revision) => revision.removedWordIds));
  const knownWords = new Set(state.words.map((word) => word.id));
  const removableIds = [...new Set(sourceWordIds)].filter((id) => knownWords.has(id) && !alreadyRemoved.has(id));
  if (removableIds.length === 0) return null;

  const operation: EditOperation = { type: "remove_words", sourceWordIds: removableIds, reason };
  const revision: EditRevision = {
    id: `revision-${now}-${activeRevisions.length + 1}`,
    parentId: activeRevisions.at(-1)?.id ?? null,
    instruction,
    operations: [operation],
    removedWordIds: removableIds,
    createdAt: now,
  };
  return {
    state: { ...state, revisions: [...activeRevisions, revision], revisionIndex: activeRevisions.length },
    operation,
  };
}

export function interpretDemoInstruction(
  input: string,
  state: TimelineState,
  selectedWordIds: string[],
): { kind: "apply"; wordIds: string[]; reason: string } | { kind: "clarify"; question: string; options: string[] } | { kind: "reject"; reason: string } {
  const instruction = input.trim();
  if (!instruction) return { kind: "reject", reason: "Enter an editing instruction first." };
  const normalized = instruction.toLowerCase();
  const removed = new Set(state.revisions.slice(0, state.revisionIndex + 1).flatMap((revision) => revision.removedWordIds));

  if (/\b(remove|cut|delete)\b/.test(normalized) && /\b(filler|fillers|filler words)\b/.test(normalized)) {
    const wordIds = state.words.filter((word) => fillerWords.has(word.text.toLowerCase().replace(/[.,!?;:]+$/g, "")) && !removed.has(word.id)).map((word) => word.id);
    if (wordIds.length === 0) return { kind: "reject", reason: "There are no remaining filler words in this transcript." };
    return { kind: "apply", wordIds, reason: "Removed transcript words classified as filler words." };
  }

  if (/\b(remove|cut|delete)\b/.test(normalized) && /\bselected words?\b/.test(normalized)) {
    const wordIds = selectedWordIds.filter((id) => !removed.has(id));
    if (wordIds.length === 0) return { kind: "reject", reason: "Select one or more transcript words before removing them." };
    return { kind: "apply", wordIds, reason: "Removed the selected transcript words by their source IDs." };
  }

  if (/\b(remove|cut|delete)\b/.test(normalized)) {
    return {
      kind: "clarify",
      question: "Which exact words or source-time range should be removed? No changes were made.",
      options: ["Remove filler words", "Remove selected words"],
    };
  }
  return {
    kind: "clarify",
    question: "This demo only applies explicit transcript removals. What should be removed? No changes were made.",
    options: ["Remove filler words", "Remove selected words"],
  };
}

export function activeWordIds(state: TimelineState): Set<string> {
  const removed = new Set(state.revisions.slice(0, state.revisionIndex + 1).flatMap((revision) => revision.removedWordIds));
  return new Set(state.words.filter((word) => !removed.has(word.id)).map((word: TranscriptWord) => word.id));
}