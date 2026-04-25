import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const tauriMocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  pickWorkspace: vi.fn(),
  refreshCodexStatus: vi.fn(),
  refreshPreviewState: vi.fn(),
  updateCodexSettings: vi.fn(),
  connectCodex: vi.fn(),
  disconnectCodex: vi.fn(),
  startPreview: vi.fn(),
  stopPreview: vi.fn(),
  restartPreview: vi.fn(),
  openPreviewInBrowser: vi.fn(),
  sendTurn: vi.fn(),
  interruptTurn: vi.fn(),
  listenCodexEvents: vi.fn(),
}));

vi.mock("./tauri", () => ({
  desktopApi: {
    bootstrap: tauriMocks.bootstrap,
    pickWorkspace: tauriMocks.pickWorkspace,
    refreshCodexStatus: tauriMocks.refreshCodexStatus,
    refreshPreviewState: tauriMocks.refreshPreviewState,
    updateCodexSettings: tauriMocks.updateCodexSettings,
    connectCodex: tauriMocks.connectCodex,
    disconnectCodex: tauriMocks.disconnectCodex,
    startPreview: tauriMocks.startPreview,
    stopPreview: tauriMocks.stopPreview,
    restartPreview: tauriMocks.restartPreview,
    openPreviewInBrowser: tauriMocks.openPreviewInBrowser,
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
      defaultModel: "gpt-5.4",
      previewCommand: "",
      codexStatus: {
        status: "ready",
        version: "codex-cli 0.121.0",
        message: "Codex CLI is ready.",
        binaryPath: "codex",
        homePath: null,
      },
      preview: {
        status: "idle",
        workspacePath: "C:/Work/demo",
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        lastError: null,
        pid: null,
        lastStartedAt: null,
        commandResolution: {
          source: "npmDev",
          label: "npm dev preview",
          command: "npm run dev -- --host 127.0.0.1 --port 4173",
          defaultUrl: "http://127.0.0.1:4173",
        },
      },
      session: {
        connected: false,
        status: "disconnected",
        workspacePath: "C:/Work/demo",
        providerThreadId: null,
        activeTurnId: null,
        lastError: null,
        activeModel: null,
      },
    });
    tauriMocks.listenCodexEvents.mockResolvedValue(() => {});
    tauriMocks.startPreview.mockResolvedValue({
      status: "booting",
      workspacePath: "C:/Work/demo",
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      lastError: null,
      pid: 123,
      lastStartedAt: "1",
      commandResolution: {
        source: "npmDev",
        label: "npm dev preview",
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        defaultUrl: "http://127.0.0.1:4173",
      },
    });
    tauriMocks.connectCodex.mockResolvedValue({
      connected: true,
      status: "ready",
      workspacePath: "C:/Work/demo",
      providerThreadId: "thread-1",
      activeTurnId: null,
      lastError: null,
      activeModel: "gpt-5.4",
    });
    tauriMocks.sendTurn.mockResolvedValue({
      accepted: true,
      turnId: "turn-1",
      message: null,
    });
  });

  it("renders the left chat and right preview shell", async () => {
    render(<App />);

    expect(await screen.findByText("Draffiti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open/i })).toBeInTheDocument();
    await waitFor(() => expect(tauriMocks.startPreview).toHaveBeenCalledTimes(1));
  });

  it("switches preview viewport modes without restarting the preview", async () => {
    render(<App />);

    await waitFor(() => expect(tauriMocks.startPreview).toHaveBeenCalledTimes(1));

    const desktopButton = screen.getByRole("button", { name: "Desktop preview" });
    const phoneButton = screen.getByRole("button", { name: "Phone preview" });

    fireEvent.click(phoneButton);
    expect(phoneButton).toHaveAttribute("aria-pressed", "true");
    expect(desktopButton).toHaveAttribute("aria-pressed", "false");
    expect(tauriMocks.startPreview).toHaveBeenCalledTimes(1);
    expect(tauriMocks.restartPreview).not.toHaveBeenCalled();

    fireEvent.click(desktopButton);
    expect(desktopButton).toHaveAttribute("aria-pressed", "true");
    expect(phoneButton).toHaveAttribute("aria-pressed", "false");
    expect(tauriMocks.startPreview).toHaveBeenCalledTimes(1);
    expect(tauriMocks.restartPreview).not.toHaveBeenCalled();
  });

  it("connects to Codex with the selected model", async () => {
    render(<App />);

    const connectButton = await screen.findByRole("button", { name: "Connect" });
    await waitFor(() => expect(connectButton).not.toBeDisabled());
    fireEvent.click(connectButton);

    await waitFor(() =>
      expect(tauriMocks.connectCodex).toHaveBeenCalledWith("C:/Work/demo", "gpt-5.4"),
    );
  });

  it("opens the preview in the system browser through Tauri", async () => {
    const windowOpenSpy = vi.spyOn(window, "open");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Open/i }));

    await waitFor(() =>
      expect(tauriMocks.openPreviewInBrowser).toHaveBeenCalledWith("http://127.0.0.1:4173"),
    );
    expect(windowOpenSpy).not.toHaveBeenCalled();
    windowOpenSpy.mockRestore();
  });

  it("sends a prompt with the selected model", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    await waitFor(() => expect(tauriMocks.connectCodex).toHaveBeenCalledTimes(1));

    const textarea = screen.getByPlaceholderText(/Describe what you want to build or change/i);
    fireEvent.change(textarea, { target: { value: "Build a login form" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(tauriMocks.sendTurn).toHaveBeenCalledWith("Build a login form", "gpt-5.4"),
    );
    expect(screen.getByText("Build a login form")).toBeInTheDocument();
  });

  it("keeps the composer text when send fails", async () => {
    tauriMocks.sendTurn.mockRejectedValueOnce("Reconnect failed");

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    await waitFor(() => expect(tauriMocks.connectCodex).toHaveBeenCalledTimes(1));

    const textarea = screen.getByPlaceholderText(/Describe what you want to build or change/i);
    fireEvent.change(textarea, { target: { value: "Retry this prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Reconnect failed");
    expect(screen.getByDisplayValue("Retry this prompt")).toBeInTheDocument();
  });
});
