import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const tauriMocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  pickWorkspace: vi.fn(),
  refreshCodexStatus: vi.fn(),
  updateCodexSettings: vi.fn(),
  connectCodex: vi.fn(),
  disconnectCodex: vi.fn(),
  sendTurn: vi.fn(),
  interruptTurn: vi.fn(),
  listenCodexEvents: vi.fn(),
}));

vi.mock("./tauri", () => ({
  desktopApi: {
    bootstrap: tauriMocks.bootstrap,
    pickWorkspace: tauriMocks.pickWorkspace,
    refreshCodexStatus: tauriMocks.refreshCodexStatus,
    updateCodexSettings: tauriMocks.updateCodexSettings,
    connectCodex: tauriMocks.connectCodex,
    disconnectCodex: tauriMocks.disconnectCodex,
    sendTurn: tauriMocks.sendTurn,
    interruptTurn: tauriMocks.interruptTurn,
    listenCodexEvents: tauriMocks.listenCodexEvents,
  },
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.bootstrap.mockResolvedValue({
      workspacePath: "C:/Work/demo",
      codexBinaryPath: "",
      codexHomePath: "",
      codexStatus: {
        status: "ready",
        version: "codex-cli 0.121.0",
        message: "Codex CLI is ready.",
        binaryPath: "codex",
        homePath: null,
      },
      session: {
        connected: false,
        status: "disconnected",
        workspacePath: "C:/Work/demo",
        providerThreadId: null,
        activeTurnId: null,
        lastError: null,
      },
    });
    tauriMocks.listenCodexEvents.mockResolvedValue(() => {});
    tauriMocks.connectCodex.mockResolvedValue({
      connected: true,
      status: "ready",
      workspacePath: "C:/Work/demo",
      providerThreadId: "thread-1",
      activeTurnId: null,
      lastError: null,
    });
    tauriMocks.sendTurn.mockResolvedValue({
      accepted: true,
      turnId: "turn-1",
      message: null,
    });
  });

  it("connects to Codex and enables the composer", async () => {
    render(<App />);

    const connectButton = await screen.findByRole("button", { name: "Connect to Codex" });
    fireEvent.click(connectButton);

    await waitFor(() =>
      expect(tauriMocks.connectCodex).toHaveBeenCalledWith("C:/Work/demo"),
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Describe what you want Codex/i)).not.toBeDisabled(),
    );
  });

  it("sends a prompt after connecting", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect to Codex" }));
    await waitFor(() => expect(tauriMocks.connectCodex).toHaveBeenCalledTimes(1));

    const textarea = screen.getByPlaceholderText(/Describe what you want Codex/i);
    fireEvent.change(textarea, { target: { value: "Build a login form" } });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    await waitFor(() =>
      expect(tauriMocks.sendTurn).toHaveBeenCalledWith("Build a login form"),
    );
    expect(screen.getByText("Build a login form")).toBeInTheDocument();
  });

  it("shows backend string errors from connect", async () => {
    tauriMocks.connectCodex.mockRejectedValueOnce(
      "Invalid request: unknown variant `workspaceWrite`",
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect to Codex" }));

    await screen.findByText("Invalid request: unknown variant `workspaceWrite`");
  });
});
