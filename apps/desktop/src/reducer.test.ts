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
    });

    const firstDelta = reduceCodexEvent(started, {
      id: "2",
      method: "item/agentMessage/delta",
      message: null,
      delta: "Hello",
      status: null,
      turnId: "turn-1",
      threadId: "thread-1",
    });
    const secondDelta = reduceCodexEvent(firstDelta, {
      id: "3",
      method: "item/agentMessage/delta",
      message: null,
      delta: " world",
      status: null,
      turnId: "turn-1",
      threadId: "thread-1",
    });

    expect(secondDelta.messages).toHaveLength(1);
    expect(secondDelta.messages[0]).toMatchObject({
      kind: "assistant",
      text: "Hello world",
      pending: true,
    });
  });

  it("marks the active turn complete and clears pending state", () => {
    const running = reduceCodexEvent(initialState, {
      id: "1",
      method: "turn/started",
      message: null,
      delta: null,
      status: "running",
      turnId: "turn-2",
      threadId: "thread-1",
    });
    const withDelta = reduceCodexEvent(running, {
      id: "2",
      method: "item/agentMessage/delta",
      message: null,
      delta: "Done",
      status: null,
      turnId: "turn-2",
      threadId: "thread-1",
    });
    const completed = reduceCodexEvent(withDelta, {
      id: "3",
      method: "turn/completed",
      message: null,
      delta: null,
      status: "completed",
      turnId: "turn-2",
      threadId: "thread-1",
    });

    expect(completed.session.status).toBe("ready");
    expect(completed.session.activeTurnId).toBeNull();
    expect(completed.messages[0]?.pending).toBe(false);
  });
});

describe("reducer", () => {
  it("adds a user message and clears the composer", () => {
    const withComposer = reducer(initialState, {
      type: "setComposer",
      composer: "Ship it",
    });
    const next = reducer(withComposer, {
      type: "appendUserMessage",
      text: "Ship it",
    });

    expect(next.composer).toBe("");
    expect(next.messages[0]).toMatchObject({
      kind: "user",
      text: "Ship it",
    });
  });

  it("resets the transcript when asked", () => {
    const seeded = reducer(
      reducer(initialState, {
        type: "appendUserMessage",
        text: "One",
      }),
      {
        type: "createAssistantDraft",
        turnId: "turn-3",
      },
    );

    const cleared = reducer(seeded, { type: "resetTranscript" });

    expect(cleared.messages).toHaveLength(0);
    expect(cleared.composer).toBe("");
  });
});
