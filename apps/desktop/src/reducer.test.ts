import { describe, expect, it } from "vitest";

import { initialState, reduceCodexEvent, reducer } from "./reducer";

describe("reduceCodexEvent", () => {
  it("accumulates assistant deltas on the same turn", () => {
    const started = reduceCodexEvent(initialState, {
      id: "1",
      method: "turn/started",
      message: null,
      delta: null,
      status: "running",
      turnId: "turn-1",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    const firstDelta = reduceCodexEvent(started, {
      id: "2",
      method: "item/agentMessage/delta",
      message: null,
      delta: "Hello",
      status: null,
      turnId: "turn-1",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });
    const secondDelta = reduceCodexEvent(firstDelta, {
      id: "3",
      method: "item/agentMessage/delta",
      message: null,
      delta: " world",
      status: null,
      turnId: "turn-1",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    expect(secondDelta.messages).toHaveLength(1);
    expect(secondDelta.messages[0]).toMatchObject({
      kind: "assistant",
      text: "Hello world",
      pending: true,
    });
  });

  it("splits assistant output into separate transcript bubbles on paragraph breaks", () => {
    const started = reduceCodexEvent(initialState, {
      id: "split-1",
      method: "turn/started",
      message: null,
      delta: null,
      status: "running",
      turnId: "turn-split",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    const next = reduceCodexEvent(started, {
      id: "split-2",
      method: "item/agentMessage/delta",
      message: null,
      delta: "Plan the layout.\n\nBuild the header.\n\nRun lint.",
      status: null,
      turnId: "turn-split",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    expect(next.messages).toHaveLength(3);
    expect(next.messages.map((message) => message.text)).toEqual([
      "Plan the layout.",
      "Build the header.",
      "Run lint.",
    ]);
    expect(next.messages.map((message) => message.pending)).toEqual([false, false, true]);
  });

  it("keeps fenced code blocks inside the same assistant bubble", () => {
    const started = reduceCodexEvent(initialState, {
      id: "code-1",
      method: "turn/started",
      message: null,
      delta: null,
      status: "running",
      turnId: "turn-code",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    const next = reduceCodexEvent(started, {
      id: "code-2",
      method: "item/agentMessage/delta",
      message: null,
      delta: "Here is the patch.\n\n```ts\nconst value = 1;\n\nconst next = 2;\n```\n\nRun lint.",
      status: null,
      turnId: "turn-code",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    expect(next.messages).toHaveLength(3);
    expect(next.messages[1]?.text).toContain("const next = 2;");
    expect(next.messages[1]?.text).toContain("```ts");
  });

  it("chunks oversized plain-text paragraphs into multiple assistant bubbles", () => {
    const started = reduceCodexEvent(initialState, {
      id: "chunk-1",
      method: "turn/started",
      message: null,
      delta: null,
      status: "running",
      turnId: "turn-chunk",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    const next = reduceCodexEvent(started, {
      id: "chunk-2",
      method: "item/agentMessage/delta",
      message: null,
      delta:
        "First I will inspect the current transcript flow and confirm how deltas are stitched together so the UI stops rendering one oversized wall of text. Then I will split long prose into smaller readable updates without touching code blocks or markdown structure. After that I will move stderr noise out of the main rail so the transcript reads cleanly during normal work.",
      status: null,
      turnId: "turn-chunk",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    expect(next.messages.length).toBeGreaterThan(1);
    expect(next.messages.every((message) => message.text.length <= 260)).toBe(true);
  });

  it("stores workspace change summaries in the transcript", () => {
    const next = reduceCodexEvent(initialState, {
      id: "4",
      method: "workspace/changes",
      message: "Changed 2 files",
      delta: null,
      status: null,
      turnId: "turn-4",
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: {
        turnId: "turn-4",
        summary: "Changed 2 files",
        added: ["src/new.ts"],
        modified: ["src/App.tsx"],
        deleted: [],
        changedFiles: ["src/new.ts", "src/App.tsx"],
        capturedAt: "1",
      },
    });

    expect(next.latestChangeSummary?.summary).toBe("Changed 2 files");
    expect(next.messages.at(-1)).toMatchObject({
      kind: "changeSummary",
      text: "Changed 2 files",
    });
  });

  it("ignores low-signal Codex router stderr noise", () => {
    const withRouterError = reduceCodexEvent(initialState, {
      id: "6",
      method: "process/stderr",
      message:
        "\u001b[2m2026-04-18T11:14:23.074981Z\u001b[0m \u001b[31mERROR\u001b[0m \u001b[2mcodex_core::tools::router\u001b[0m: \u001b[3merror\u001b[0m=\u001b[0mExit code: 1",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });
    const withWallTime = reduceCodexEvent(withRouterError, {
      id: "7",
      method: "process/stderr",
      message: "Wall time: 3.8 seconds",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });
    const withOutput = reduceCodexEvent(withWallTime, {
      id: "8",
      method: "process/stderr",
      message: "Output:",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });

    expect(withOutput.messages).toHaveLength(0);
  });

  it("ignores low-signal npm scaffold stderr noise", () => {
    const withProjectLoad = reduceCodexEvent(initialState, {
      id: "10",
      method: "process/stderr",
      message:
        "Loading project files... Something went wrong in downloading and extracting the project files: Cannot read properties of undefined (reading 'match')",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });
    const withNpmPath = reduceCodexEvent(withProjectLoad, {
      id: "11",
      method: "process/stderr",
      message: "npm error path C:\\repo\\test",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });
    const withTypeError = reduceCodexEvent(withNpmPath, {
      id: "12",
      method: "process/stderr",
      message: "TypeError: Cannot read properties of undefined (reading 'match')",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });

    expect(withTypeError.messages).toHaveLength(0);
  });

  it("keeps real stderr messages visible", () => {
    const next = reduceCodexEvent(initialState, {
      id: "9",
      method: "process/stderr",
      message: "npm ERR! could not determine executable to run",
      delta: null,
      status: "error",
      turnId: null,
      threadId: "thread-1",
      activeModel: null,
      preview: null,
      changeSummary: null,
    });

    expect(next.messages.at(-1)).toMatchObject({
      kind: "error",
      text: "npm ERR! could not determine executable to run",
    });
  });

  it("deduplicates repeated error notifications", () => {
    const first = reduceCodexEvent(initialState, {
      id: "13",
      method: "error",
      message: "Could not send the turn.",
      delta: null,
      status: "error",
      turnId: null,
      threadId: null,
      activeModel: null,
      preview: null,
      changeSummary: null,
    });
    const second = reduceCodexEvent(first, {
      id: "14",
      method: "error",
      message: "Could not send the turn.",
      delta: null,
      status: "error",
      turnId: null,
      threadId: null,
      activeModel: null,
      preview: null,
      changeSummary: null,
    });

    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toMatchObject({
      kind: "error",
      text: "Could not send the turn.",
    });
  });

  it("removes empty assistant drafts when a turn completes without content", () => {
    const started = reduceCodexEvent(initialState, {
      id: "empty-1",
      method: "turn/started",
      message: null,
      delta: null,
      status: "running",
      turnId: "turn-empty",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    const next = reduceCodexEvent(started, {
      id: "empty-2",
      method: "turn/completed",
      message: null,
      delta: null,
      status: "completed",
      turnId: "turn-empty",
      threadId: "thread-1",
      activeModel: "gpt-5.4",
      preview: null,
      changeSummary: null,
    });

    expect(next.messages).toHaveLength(0);
  });
});

describe("reducer", () => {
  it("defaults the preview viewport mode to desktop", () => {
    expect(initialState.previewViewportMode).toBe("desktop");
  });

  it("updates the preview viewport mode without affecting other state", () => {
    const next = reducer(initialState, {
      type: "setPreviewViewportMode",
      previewViewportMode: "phone",
    });

    expect(next.previewViewportMode).toBe("phone");
    expect(next.preview.status).toBe(initialState.preview.status);
  });

  it("commits a sent prompt and clears the composer", () => {
    const withComposer = reducer(initialState, {
      type: "setComposer",
      composer: "Ship it",
    });
    const next = reducer(withComposer, {
      type: "commitSentPrompt",
      text: "Ship it",
      turnId: "turn-2",
    });

    expect(next.composer).toBe("");
    expect(next.messages[0]).toMatchObject({
      kind: "user",
      text: "Ship it",
      turnId: "turn-2",
    });
  });

  it("keeps the selected model aligned with the active session after replacement", () => {
    const next = reducer(initialState, {
      type: "replaceSession",
      session: {
        connected: true,
        status: "ready",
        workspacePath: "C:/repo",
        providerThreadId: "thread-1",
        activeTurnId: null,
        lastError: null,
        activeModel: "gpt-5.4",
      },
    });

    expect(next.selectedModel).toBe("gpt-5.4");
  });

  it("resets transcript state including change summaries", () => {
    const seeded = reduceCodexEvent(
      reducer(initialState, {
        type: "commitSentPrompt",
        text: "One",
        turnId: "turn-1",
      }),
      {
        id: "5",
        method: "workspace/changes",
        message: "Changed 1 files",
        delta: null,
        status: null,
        turnId: "turn-1",
        threadId: "thread-1",
        activeModel: null,
        preview: null,
        changeSummary: {
          turnId: "turn-1",
          summary: "Changed 1 files",
          added: [],
          modified: ["src/App.tsx"],
          deleted: [],
          changedFiles: ["src/App.tsx"],
          capturedAt: "1",
        },
      },
    );

    const cleared = reducer(seeded, { type: "resetTranscript" });

    expect(cleared.messages).toHaveLength(0);
    expect(cleared.changeSummaries).toHaveLength(0);
    expect(cleared.latestChangeSummary).toBeNull();
  });

  it("does not reset the preview viewport mode on preview state updates", () => {
    const withPhoneMode = reducer(initialState, {
      type: "setPreviewViewportMode",
      previewViewportMode: "phone",
    });
    const next = reducer(withPhoneMode, {
      type: "replacePreview",
      preview: {
        status: "ready",
        workspacePath: "C:/repo",
        command: "npm run dev",
        url: "http://127.0.0.1:4173",
        lastError: null,
        pid: 42,
        lastStartedAt: "1",
        commandResolution: null,
      },
    });

    expect(next.previewViewportMode).toBe("phone");
  });
});
