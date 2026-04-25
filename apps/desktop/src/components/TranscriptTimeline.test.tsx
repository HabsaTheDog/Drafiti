import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../types";
import { TranscriptTimeline } from "./TranscriptTimeline";

function makeMessage(message: Partial<ChatMessage> & Pick<ChatMessage, "id" | "kind" | "text">) {
  return {
    createdAt: "1",
    ...message,
  } satisfies ChatMessage;
}

describe("TranscriptTimeline", () => {
  it("keeps diagnostics out of the main transcript flow", () => {
    render(
      <TranscriptTimeline
        bootstrapping={false}
        bootstrapError={null}
        transcriptRef={createRef<HTMLDivElement>()}
        messages={[
          makeMessage({ id: "user-1", kind: "user", text: "Build a homepage" }),
          makeMessage({ id: "assistant-1", kind: "assistant", text: "I split this up." }),
          makeMessage({
            id: "error-1",
            kind: "error",
            text: "npm ERR! could not determine executable to run",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Build a homepage")).toBeInTheDocument();
    expect(screen.getByText("I split this up.")).toBeInTheDocument();
    expect(screen.getByText("npm ERR! could not determine executable to run")).not.toBeVisible();
    expect(screen.getByText(/Diagnostics \(1\)/)).toBeInTheDocument();
  });
});
