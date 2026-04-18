import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreviewFrame } from "./PreviewFrame";

const readyPreview = {
  status: "ready" as const,
  workspacePath: "C:/Work/demo",
  command: "npm run dev",
  url: "http://127.0.0.1:4173",
  lastError: null,
  pid: 123,
  lastStartedAt: "1",
  commandResolution: null,
};

describe("PreviewFrame", () => {
  it("renders a full-width shell in desktop mode", () => {
    render(<PreviewFrame preview={readyPreview} previewViewportMode="desktop" />);

    const shell = screen.getByTestId("preview-viewport-shell");
    expect(shell).toHaveAttribute("data-viewport-mode", "desktop");
    expect(shell.className).toContain("max-w-full");
  });

  it("renders a phone-width shell in phone mode without changing the iframe url", () => {
    render(<PreviewFrame preview={readyPreview} previewViewportMode="phone" />);

    const shell = screen.getByTestId("preview-viewport-shell");
    const iframe = screen.getByTitle("Website preview");

    expect(shell).toHaveAttribute("data-viewport-mode", "phone");
    expect(shell.className).toContain("max-w-[390px]");
    expect(iframe).toHaveAttribute("src", "http://127.0.0.1:4173");
  });
});
