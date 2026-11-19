import { describe, expect, it } from "vitest";

import { activeWordIds, applyWordRemoval, durationAfterEdits, interpretDemoInstruction } from "@/features/editor/edit-engine";
import type { TimelineState } from "@/features/editor/types";

const initialState: TimelineState = {
  sourceDurationSeconds: 10,
  words: [
    { id: "word-a", startSeconds: 1, endSeconds: 1.4, text: "We", speakerId: "speaker-1", confidence: 0.99 },
    { id: "word-um", startSeconds: 1.4, endSeconds: 1.8, text: "Um,", speakerId: "speaker-1", confidence: 0.64 },
    { id: "word-b", startSeconds: 1.8, endSeconds: 2.2, text: "begin", speakerId: "speaker-1", confidence: 0.98 },
  ],
  revisions: [],
  revisionIndex: -1,
};

describe("VideoFlow timeline engine", () => {
  it("removes only the source word IDs chosen by a deterministic filler-word instruction", () => {
    const result = interpretDemoInstruction("Remove filler words", initialState, []);
    expect(result).toEqual({ kind: "apply", wordIds: ["word-um"], reason: "Removed transcript words classified as filler words." });
  });

  it("keeps the original source duration and calculates duration from removed word timestamps", () => {
    const applied = applyWordRemoval(initialState, ["word-um"], "Remove filler words", "Filler removal", "2026-01-01T00:00:00.000Z");
    expect(applied?.state.sourceDurationSeconds).toBe(10);
    expect(applied ? durationAfterEdits(applied.state) : null).toBeCloseTo(9.6);
  });

  it("does not execute ambiguous destructive instructions", () => {
    const result = interpretDemoInstruction("Cut the beginning", initialState, []);
    expect(result.kind).toBe("clarify");
    expect(activeWordIds(initialState).size).toBe(3);
  });

  it("clears the redo branch when a new revision follows an undo", () => {
    const first = applyWordRemoval(initialState, ["word-um"], "Remove um", "Selected", "first");
    expect(first).not.toBeNull();
    const secondState = { ...initialState, revisions: first?.state.revisions ?? [], revisionIndex: -1 };
    const second = applyWordRemoval(secondState, ["word-b"], "Remove begin", "Selected", "second");
    expect(second?.state.revisions.map((revision) => revision.removedWordIds)).toEqual([["word-b"]]);
  });
});