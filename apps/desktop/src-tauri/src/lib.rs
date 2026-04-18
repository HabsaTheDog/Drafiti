mod prompt_profile;

use std::{
  collections::{hash_map::DefaultHasher, HashMap, HashSet},
  env, fs,
  hash::{Hash, Hasher},
  io::{BufRead, BufReader, Read, Write},
  net::{TcpStream, ToSocketAddrs},
  path::{Path, PathBuf},
  process::{Child, ChildStdin, Command, Stdio},
  sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
  },
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::{
  ffi::OsString,
  os::windows::ffi::{OsStrExt, OsStringExt},
};

use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{sync::oneshot, time::timeout};
use uuid::Uuid;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;
#[cfg(windows)]
use windows_sys::Win32::{
  UI::{
    Shell::ShellExecuteW,
    WindowsAndMessaging::SW_SHOWNORMAL,
  },
};

use crate::prompt_profile::{build_turn_input, prompt_profile, SessionPromptContext};

const CODEX_EVENT_NAME: &str = "codex-event";
const SETTINGS_FILE_NAME: &str = "settings.json";
const REQUEST_TIMEOUT_SECONDS: u64 = 20;
const SESSION_SERVICE_NAME: &str = "draffiti_desktop";
const CODEX_RUNTIME_DIR_NAME: &str = "codex-runtime";
const CODEX_RUNTIME_CACHE_DIR_NAME: &str = "npm-cache";
const CODEX_RUNTIME_TEMP_DIR_NAME: &str = "tmp";
const PREVIEW_READY_TIMEOUT_SECONDS: u64 = 45;
const PREVIEW_POLL_INTERVAL_MILLIS: u64 = 500;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PersistedSettings {
  workspace_path: Option<String>,
  codex_binary_path: Option<String>,
  codex_home_path: Option<String>,
  default_model: Option<String>,
  preview_command: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CodexStatus {
  status: String,
  version: Option<String>,
  message: String,
  binary_path: String,
  home_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PreviewCommandResolutionPayload {
  source: String,
  label: String,
  command: Option<String>,
  default_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PreviewStatePayload {
  status: String,
  workspace_path: Option<String>,
  command: Option<String>,
  url: Option<String>,
  last_error: Option<String>,
  pid: Option<u32>,
  last_started_at: Option<String>,
  command_resolution: Option<PreviewCommandResolutionPayload>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceChangeSummaryPayload {
  turn_id: Option<String>,
  summary: String,
  added: Vec<String>,
  modified: Vec<String>,
  deleted: Vec<String>,
  changed_files: Vec<String>,
  captured_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct SessionStatePayload {
  connected: bool,
  status: String,
  workspace_path: Option<String>,
  provider_thread_id: Option<String>,
  active_turn_id: Option<String>,
  last_error: Option<String>,
  active_model: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
  workspace_path: Option<String>,
  codex_binary_path: Option<String>,
  codex_home_path: Option<String>,
  default_model: Option<String>,
  preview_command: Option<String>,
  codex_status: CodexStatus,
  preview: PreviewStatePayload,
  session: SessionStatePayload,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSelection {
  workspace_path: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexSettingsInput {
  codex_binary_path: Option<String>,
  codex_home_path: Option<String>,
  default_model: Option<String>,
  preview_command: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectCodexInput {
  workspace_path: String,
  model: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendTurnInput {
  text: String,
  model: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PreviewScriptCandidate {
  script_name: &'static str,
  source: &'static str,
  label: &'static str,
}

const PREVIEW_SCRIPT_CANDIDATES: [PreviewScriptCandidate; 7] = [
  PreviewScriptCandidate {
    script_name: "dev",
    source: "npmDev",
    label: "npm dev preview",
  },
  PreviewScriptCandidate {
    script_name: "dev:web",
    source: "npmScript",
    label: "npm dev:web preview",
  },
  PreviewScriptCandidate {
    script_name: "start:web",
    source: "npmScript",
    label: "npm start:web preview",
  },
  PreviewScriptCandidate {
    script_name: "web",
    source: "npmScript",
    label: "npm web preview",
  },
  PreviewScriptCandidate {
    script_name: "preview",
    source: "npmScript",
    label: "npm preview",
  },
  PreviewScriptCandidate {
    script_name: "start",
    source: "npmScript",
    label: "npm start preview",
  },
  PreviewScriptCandidate {
    script_name: "serve",
    source: "npmScript",
    label: "npm serve preview",
  },
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct TurnAck {
  accepted: bool,
  turn_id: Option<String>,
  message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexEventEnvelope {
  id: String,
  method: String,
  message: Option<String>,
  delta: Option<String>,
  status: Option<String>,
  turn_id: Option<String>,
  thread_id: Option<String>,
  active_model: Option<String>,
  preview: Option<PreviewStatePayload>,
  change_summary: Option<WorkspaceChangeSummaryPayload>,
}

#[derive(Debug)]
struct SettingsStore {
  path: PathBuf,
  value: Mutex<PersistedSettings>,
}

impl SettingsStore {
  fn load(path: PathBuf) -> Result<Self, String> {
    let value = if path.exists() {
      let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read settings file: {error}"))?;
      serde_json::from_str::<PersistedSettings>(&raw)
        .map_err(|error| format!("Could not parse settings file: {error}"))?
    } else {
      PersistedSettings::default()
    };

    Ok(Self {
      path,
      value: Mutex::new(value),
    })
  }

  fn snapshot(&self) -> PersistedSettings {
    self.value.lock().expect("settings lock poisoned").clone()
  }

  fn update<F>(&self, updater: F) -> Result<PersistedSettings, String>
  where
    F: FnOnce(&mut PersistedSettings),
  {
    let mut settings = self.value.lock().expect("settings lock poisoned");
    updater(&mut settings);
    let serialized = serde_json::to_string_pretty(&*settings)
      .map_err(|error| format!("Could not encode settings: {error}"))?;
    if let Some(parent) = self.path.parent() {
      fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create settings directory: {error}"))?;
    }
    fs::write(&self.path, serialized)
      .map_err(|error| format!("Could not write settings file: {error}"))?;
    Ok(settings.clone())
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceFileSnapshot {
  size: u64,
  modified_millis: u128,
  hash: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSnapshot {
  files: HashMap<String, WorkspaceFileSnapshot>,
}

#[derive(Clone, Debug)]
struct SessionRuntimeState {
  workspace_path: String,
  codex_workspace_path: String,
  status: String,
  provider_thread_id: Option<String>,
  active_turn_id: Option<String>,
  last_error: Option<String>,
  project_brief: Option<String>,
  active_model: Option<String>,
}

impl SessionRuntimeState {
  fn to_payload(&self) -> SessionStatePayload {
    SessionStatePayload {
      connected: self.status != "disconnected",
      status: self.status.clone(),
      workspace_path: Some(self.workspace_path.clone()),
      provider_thread_id: self.provider_thread_id.clone(),
      active_turn_id: self.active_turn_id.clone(),
      last_error: self.last_error.clone(),
      active_model: self.active_model.clone(),
    }
  }

  fn project_brief_for_turn(&self, text: &str) -> String {
    self
      .project_brief
      .clone()
      .unwrap_or_else(|| text.to_string())
  }

  fn remember_project_brief(&mut self, text: &str) {
    if self.project_brief.is_none() {
      self.project_brief = Some(text.to_string());
    }
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CodexRuntimePaths {
  cache_root: String,
  temp_root: String,
}

struct CodexSession {
  app_handle: AppHandle,
  child: Mutex<Child>,
  stdin: Mutex<ChildStdin>,
  pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
  next_request_id: AtomicU64,
  stopping: AtomicBool,
  runtime: Mutex<SessionRuntimeState>,
  pending_snapshots: Mutex<HashMap<String, WorkspaceSnapshot>>,
}

impl CodexSession {
  async fn start(
    app_handle: AppHandle,
    settings: &PersistedSettings,
    workspace_path: String,
    codex_workspace_path: String,
    runtime_paths: CodexRuntimePaths,
    active_model: Option<String>,
  ) -> Result<Arc<Self>, String> {
    let global_args = build_codex_global_args(active_model.as_deref());
    let (mut command, binary_path) = build_codex_command(settings, &global_args, &["app-server"]);
    apply_codex_runtime_env(&mut command, &runtime_paths);
    command
      .current_dir(&codex_workspace_path)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());

    let mut child = command
      .spawn()
      .map_err(|error| format!("Could not start Codex app-server at `{binary_path}`: {error}"))?;
    let stdout = child
      .stdout
      .take()
      .ok_or_else(|| "Codex app-server did not expose stdout.".to_string())?;
    let stderr = child
      .stderr
      .take()
      .ok_or_else(|| "Codex app-server did not expose stderr.".to_string())?;
    let stdin = child
      .stdin
      .take()
      .ok_or_else(|| "Codex app-server did not expose stdin.".to_string())?;

    let session = Arc::new(Self {
      app_handle: app_handle.clone(),
      child: Mutex::new(child),
      stdin: Mutex::new(stdin),
      pending: Mutex::new(HashMap::new()),
      next_request_id: AtomicU64::new(1),
      stopping: AtomicBool::new(false),
      runtime: Mutex::new(SessionRuntimeState {
        workspace_path: workspace_path.clone(),
        codex_workspace_path: codex_workspace_path.clone(),
        status: "connecting".to_string(),
        provider_thread_id: None,
        active_turn_id: None,
        last_error: None,
        project_brief: None,
        active_model: active_model.clone(),
      }),
      pending_snapshots: Mutex::new(HashMap::new()),
    });

    session.emit(
      "session/connecting",
      Some("Starting Codex app-server.".to_string()),
      None,
      None,
      None,
      None,
      active_model.clone(),
      None,
      None,
    );
    session.spawn_stdout_pump(stdout);
    session.spawn_stderr_pump(stderr);
    session.spawn_exit_watcher();

    session
      .send_request(
        "initialize",
        json!({
          "clientInfo": {
            "name": SESSION_SERVICE_NAME,
            "title": "Draffiti Desktop",
            "version": env!("CARGO_PKG_VERSION"),
          },
          "capabilities": {
            "experimentalApi": true,
          }
        }),
        Duration::from_secs(REQUEST_TIMEOUT_SECONDS),
      )
      .await?;
    session.send_notification("initialized", json!({}))?;
    let _ = session
      .send_request(
        "account/read",
        json!({ "refreshToken": false }),
        Duration::from_secs(REQUEST_TIMEOUT_SECONDS),
      )
      .await;

    let thread_response = session
      .send_request(
        "thread/start",
        json!({
          "cwd": codex_workspace_path,
          "approvalPolicy": "never",
          "sandbox": "danger-full-access",
          "serviceName": SESSION_SERVICE_NAME,
        }),
        Duration::from_secs(REQUEST_TIMEOUT_SECONDS),
      )
      .await?;
    let provider_thread_id = thread_response
      .get("thread")
      .and_then(|thread| thread.get("id"))
      .and_then(Value::as_str)
      .map(str::to_owned)
      .ok_or_else(|| "Codex thread/start response did not include a thread id.".to_string())?;

    session.update_runtime(|runtime| {
      runtime.provider_thread_id = Some(provider_thread_id.clone());
      runtime.status = "ready".to_string();
      runtime.last_error = None;
    });
    session.emit(
      "session/ready",
      Some(format!("Connected to thread {provider_thread_id}.")),
      None,
      Some("ready".to_string()),
      None,
      Some(provider_thread_id),
      active_model,
      None,
      None,
    );

    Ok(session)
  }

  fn snapshot(&self) -> SessionStatePayload {
    self.runtime.lock().expect("runtime lock poisoned").to_payload()
  }

  async fn send_turn(&self, text: String) -> Result<TurnAck, String> {
    let runtime = self.runtime.lock().expect("runtime lock poisoned").clone();
    let project_brief = runtime.project_brief_for_turn(&text);
    let provider_thread_id = runtime
      .provider_thread_id
      .clone()
      .ok_or_else(|| "Codex session is missing a provider thread id.".to_string())?;
    let codex_workspace_path = runtime.codex_workspace_path.clone();
    let input = build_turn_input(
      prompt_profile(),
      &SessionPromptContext { project_brief },
      &text,
    );
    let before_snapshot = capture_workspace_snapshot(&runtime.workspace_path)?;

    let response = self
      .send_request(
        "turn/start",
        json!({
          "threadId": provider_thread_id,
          "cwd": codex_workspace_path,
          "approvalPolicy": "never",
          "sandboxPolicy": {
            "type": "dangerFullAccess",
          },
          "input": input
        }),
        Duration::from_secs(REQUEST_TIMEOUT_SECONDS),
      )
      .await?;

    let turn_id = response
      .get("turn")
      .and_then(|turn| turn.get("id"))
      .and_then(Value::as_str)
      .map(str::to_owned)
      .ok_or_else(|| "Codex turn/start response did not include a turn id.".to_string())?;

    self
      .pending_snapshots
      .lock()
      .expect("snapshot lock poisoned")
      .insert(turn_id.clone(), before_snapshot);
    self.update_runtime(|state| {
      state.status = "running".to_string();
      state.active_turn_id = Some(turn_id.clone());
      state.last_error = None;
      state.remember_project_brief(&text);
    });

    Ok(TurnAck {
      accepted: true,
      turn_id: Some(turn_id),
      message: None,
    })
  }

  async fn interrupt_turn(&self) -> Result<TurnAck, String> {
    let runtime = self.runtime.lock().expect("runtime lock poisoned").clone();
    let provider_thread_id = runtime
      .provider_thread_id
      .clone()
      .ok_or_else(|| "Codex session is missing a provider thread id.".to_string())?;
    let turn_id = runtime
      .active_turn_id
      .clone()
      .ok_or_else(|| "There is no active turn to interrupt.".to_string())?;

    self
      .send_request(
        "turn/interrupt",
        json!({
          "threadId": provider_thread_id,
          "turnId": turn_id,
        }),
        Duration::from_secs(REQUEST_TIMEOUT_SECONDS),
      )
      .await?;

    Ok(TurnAck {
      accepted: true,
      turn_id: Some(turn_id),
      message: Some("Interrupt requested.".to_string()),
    })
  }

  fn shutdown(&self, emit_error: Option<String>) -> Result<(), String> {
    self.stopping.store(true, Ordering::SeqCst);

    let mut pending = self.pending.lock().expect("pending lock poisoned");
    for (_, sender) in pending.drain() {
      let _ = sender.send(Err("Codex session stopped before the request completed.".to_string()));
    }
    drop(pending);
    self
      .pending_snapshots
      .lock()
      .expect("snapshot lock poisoned")
      .clear();

    if let Some(message) = emit_error {
      self.update_runtime(|runtime| {
        runtime.status = "disconnected".to_string();
        runtime.active_turn_id = None;
        runtime.last_error = Some(message.clone());
      });
      self.emit(
        "session/error",
        Some(message),
        None,
        Some("error".to_string()),
        None,
        None,
        None,
        None,
        None,
      );
    } else {
      self.update_runtime(|runtime| {
        runtime.status = "disconnected".to_string();
        runtime.active_turn_id = None;
      });
    }

    let pid = self.child.lock().expect("child lock poisoned").id();
    kill_process_tree(pid)?;
    Ok(())
  }

  fn spawn_stdout_pump(self: &Arc<Self>, stdout: impl Read + Send + 'static) {
    let session = Arc::clone(self);
    thread::spawn(move || {
      let reader = BufReader::new(stdout);
      for line in reader.lines() {
        match line {
          Ok(raw) => {
            if raw.trim().is_empty() {
              continue;
            }
            if let Err(error) = session.handle_stdout_line(&raw) {
              session.emit(
                "process/stderr",
                Some(format!("Could not parse Codex app-server output: {error}")),
                None,
                Some("error".to_string()),
                None,
                None,
                None,
                None,
                None,
              );
            }
          }
          Err(error) => {
            if !session.stopping.load(Ordering::SeqCst) {
              session.emit(
                "process/stderr",
                Some(format!("Could not read Codex stdout: {error}")),
                None,
                Some("error".to_string()),
                None,
                None,
                None,
                None,
                None,
              );
            }
            break;
          }
        }
      }
    });
  }

  fn spawn_stderr_pump(self: &Arc<Self>, stderr: impl Read + Send + 'static) {
    let session = Arc::clone(self);
    thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines() {
        match line {
          Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
              continue;
            }
            session.emit(
              "process/stderr",
              Some(trimmed.to_string()),
              None,
              Some("error".to_string()),
              None,
              None,
              None,
              None,
              None,
            );
          }
          Err(error) => {
            if !session.stopping.load(Ordering::SeqCst) {
              session.emit(
                "process/stderr",
                Some(format!("Could not read Codex stderr: {error}")),
                None,
                Some("error".to_string()),
                None,
                None,
                None,
                None,
                None,
              );
            }
            break;
          }
        }
      }
    });
  }

  fn spawn_exit_watcher(self: &Arc<Self>) {
    let session = Arc::clone(self);
    thread::spawn(move || loop {
      if session.stopping.load(Ordering::SeqCst) {
        break;
      }
      let exit_status = {
        let mut child = session.child.lock().expect("child lock poisoned");
        match child.try_wait() {
          Ok(Some(status)) => Some(status),
          Ok(None) => None,
          Err(error) => {
            session.emit(
              "session/error",
              Some(format!("Could not watch Codex process: {error}")),
              None,
              Some("error".to_string()),
              None,
              None,
              None,
              None,
              None,
            );
            session.update_runtime(|runtime| {
              runtime.status = "disconnected".to_string();
              runtime.active_turn_id = None;
              runtime.last_error = Some(format!("Could not watch Codex process: {error}"));
            });
            break;
          }
        }
      };

      if let Some(status) = exit_status {
        if !session.stopping.load(Ordering::SeqCst) {
          let message = format!("Codex app-server exited unexpectedly with status {status}.");
          session.update_runtime(|runtime| {
            runtime.status = "disconnected".to_string();
            runtime.active_turn_id = None;
            runtime.last_error = Some(message.clone());
          });
          session.emit(
            "session/error",
            Some(message),
            None,
            Some("error".to_string()),
            None,
            None,
            None,
            None,
            None,
          );
        }
        break;
      }

      thread::sleep(Duration::from_millis(250));
    });
  }

  fn handle_stdout_line(&self, raw: &str) -> Result<(), String> {
    let value: Value =
      serde_json::from_str(raw).map_err(|error| format!("Invalid JSON line: {error}"))?;

    let has_method = value.get("method").and_then(Value::as_str).is_some();
    let maybe_id = parse_response_id(&value);

    match (has_method, maybe_id) {
      (false, Some(id)) => self.handle_response(id, &value),
      (true, Some(id)) => self.handle_server_request(id, &value),
      (true, None) => self.handle_notification(&value),
      (false, None) => Ok(()),
    }
  }

  fn handle_response(&self, id: u64, value: &Value) -> Result<(), String> {
    let result = if let Some(error) = value.get("error") {
      Err(extract_error_message(error))
    } else {
      Ok(value.get("result").cloned().unwrap_or(Value::Null))
    };

    if let Some(sender) = self.pending.lock().expect("pending lock poisoned").remove(&id) {
      let _ = sender.send(result);
    }
    Ok(())
  }

  fn handle_server_request(&self, id: u64, value: &Value) -> Result<(), String> {
    let method = value
      .get("method")
      .and_then(Value::as_str)
      .ok_or_else(|| "Server request did not include a method.".to_string())?;

    let message = format!("Draffiti v1 does not support Codex request `{method}` yet.");
    self.update_runtime(|runtime| {
      runtime.status = "error".to_string();
      runtime.active_turn_id = None;
      runtime.last_error = Some(message.clone());
    });
    self.emit(
      "session/error",
      Some(message.clone()),
      None,
      Some("error".to_string()),
      None,
      None,
      None,
      None,
      None,
    );
    self.write_message(&json!({
      "id": id,
      "error": {
        "code": -32601,
        "message": message,
      }
    }))?;
    Ok(())
  }

  fn handle_notification(&self, value: &Value) -> Result<(), String> {
    let method = value
      .get("method")
      .and_then(Value::as_str)
      .ok_or_else(|| "Notification did not include a method.".to_string())?;
    let params = value.get("params").cloned().unwrap_or(Value::Null);

    match method {
      "thread/started" => {
        let thread_id = params
          .get("thread")
          .and_then(|thread| thread.get("id"))
          .and_then(Value::as_str)
          .map(str::to_owned);
        if let Some(thread_id) = thread_id.clone() {
          self.update_runtime(|runtime| runtime.provider_thread_id = Some(thread_id.clone()));
        }
        self.emit(method, None, None, None, None, thread_id, None, None, None);
      }
      "turn/started" => {
        let turn_id = params
          .get("turn")
          .and_then(|turn| turn.get("id"))
          .and_then(Value::as_str)
          .map(str::to_owned);
        if let Some(turn_id) = turn_id.clone() {
          self.update_runtime(|runtime| {
            runtime.status = "running".to_string();
            runtime.active_turn_id = Some(turn_id.clone());
          });
        }
        self.emit(
          method,
          None,
          None,
          Some("running".to_string()),
          turn_id,
          None,
          None,
          None,
          None,
        );
      }
      "item/agentMessage/delta" => {
        let turn_id = params
          .get("turnId")
          .and_then(Value::as_str)
          .map(str::to_owned)
          .or_else(|| {
            params
              .get("turn")
              .and_then(|turn| turn.get("id"))
              .and_then(Value::as_str)
              .map(str::to_owned)
          });
        let delta = params.get("delta").and_then(Value::as_str).map(str::to_owned);
        self.emit(method, None, delta, None, turn_id, None, None, None, None);
      }
      "turn/completed" => {
        let turn = params.get("turn").cloned().unwrap_or(Value::Null);
        let turn_id = turn.get("id").and_then(Value::as_str).map(str::to_owned);
        let status = turn
          .get("status")
          .and_then(Value::as_str)
          .map(str::to_owned)
          .unwrap_or_else(|| "completed".to_string());
        let message = turn
          .get("error")
          .and_then(|error| error.get("message"))
          .and_then(Value::as_str)
          .map(str::to_owned);

        self.update_runtime(|runtime| {
          runtime.status = if status == "failed" {
            "error".to_string()
          } else {
            "ready".to_string()
          };
          runtime.active_turn_id = None;
          runtime.last_error = if status == "failed" { message.clone() } else { None };
        });
        self.emit(
          method,
          message.clone(),
          None,
          Some(status),
          turn_id.clone(),
          None,
          None,
          None,
          None,
        );
        if let Some(turn_id) = turn_id {
          if let Err(error) = self.emit_workspace_changes(turn_id) {
            self.emit(
              "process/stderr",
              Some(format!("Could not summarize workspace changes: {error}")),
              None,
              Some("error".to_string()),
              None,
              None,
              None,
              None,
              None,
            );
          }
        }
      }
      "error" => {
        let message = params
          .get("error")
          .and_then(|error| error.get("message"))
          .and_then(Value::as_str)
          .map(str::to_owned)
          .or_else(|| params.get("message").and_then(Value::as_str).map(str::to_owned))
          .unwrap_or_else(|| "Codex app-server emitted an error notification.".to_string());
        self.emit(
          method,
          Some(message),
          None,
          Some("error".to_string()),
          None,
          None,
          None,
          None,
          None,
        );
      }
      _ => {}
    }

    Ok(())
  }

  fn emit_workspace_changes(&self, turn_id: String) -> Result<(), String> {
    let before_snapshot = self
      .pending_snapshots
      .lock()
      .expect("snapshot lock poisoned")
      .remove(&turn_id);
    let Some(before_snapshot) = before_snapshot else {
      return Ok(());
    };

    let workspace_path = self
      .runtime
      .lock()
      .expect("runtime lock poisoned")
      .workspace_path
      .clone();
    let after_snapshot = capture_workspace_snapshot(&workspace_path)?;
    let summary = diff_workspace_snapshots(Some(turn_id), before_snapshot, after_snapshot);
    self.emit(
      "workspace/changes",
      Some(summary.summary.clone()),
      None,
      None,
      summary.turn_id.clone(),
      None,
      None,
      None,
      Some(summary),
    );
    Ok(())
  }

  async fn send_request(
    &self,
    method: &str,
    params: Value,
    timeout_duration: Duration,
  ) -> Result<Value, String> {
    let request_id = self.next_request_id.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = oneshot::channel();
    self
      .pending
      .lock()
      .expect("pending lock poisoned")
      .insert(request_id, sender);

    self.write_message(&json!({
      "id": request_id,
      "method": method,
      "params": params,
    }))?;

    match timeout(timeout_duration, receiver).await {
      Ok(Ok(result)) => result,
      Ok(Err(_)) => Err("Codex request channel closed unexpectedly.".to_string()),
      Err(_) => {
        self
          .pending
          .lock()
          .expect("pending lock poisoned")
          .remove(&request_id);
        Err(format!("Codex request `{method}` timed out after {timeout_duration:?}."))
      }
    }
  }

  fn send_notification(&self, method: &str, params: Value) -> Result<(), String> {
    self.write_message(&json!({
      "method": method,
      "params": params,
    }))
  }

  fn write_message(&self, payload: &Value) -> Result<(), String> {
    let serialized =
      serde_json::to_string(payload).map_err(|error| format!("Could not encode JSON: {error}"))?;
    let mut stdin = self.stdin.lock().expect("stdin lock poisoned");
    stdin
      .write_all(serialized.as_bytes())
      .and_then(|_| stdin.write_all(b"\n"))
      .and_then(|_| stdin.flush())
      .map_err(|error| format!("Could not write to Codex stdin: {error}"))
  }

  fn update_runtime<F>(&self, updater: F)
  where
    F: FnOnce(&mut SessionRuntimeState),
  {
    let mut runtime = self.runtime.lock().expect("runtime lock poisoned");
    updater(&mut runtime);
  }

  #[allow(clippy::too_many_arguments)]
  fn emit(
    &self,
    method: &str,
    message: Option<String>,
    delta: Option<String>,
    status: Option<String>,
    turn_id: Option<String>,
    thread_id: Option<String>,
    active_model: Option<String>,
    preview: Option<PreviewStatePayload>,
    change_summary: Option<WorkspaceChangeSummaryPayload>,
  ) {
    let fallback = self.runtime.lock().expect("runtime lock poisoned").clone();
    emit_event(
      &self.app_handle,
      method,
      message,
      delta,
      status,
      turn_id,
      thread_id.or(fallback.provider_thread_id),
      active_model.or(fallback.active_model),
      preview,
      change_summary,
    );
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ResolvedPreviewCommand {
  executable: String,
  args: Vec<String>,
  display_command: String,
  default_url: Option<String>,
  resolution: PreviewCommandResolutionPayload,
}

impl ResolvedPreviewCommand {
  fn to_command(&self) -> Command {
    let mut command = Command::new(&self.executable);
    command.args(&self.args);
    command.env("BROWSER", "none");
    command.env("CI", "1");
    command
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PreviewRuntimeState {
  status: String,
  workspace_path: String,
  command: String,
  url: Option<String>,
  last_error: Option<String>,
  pid: Option<u32>,
  last_started_at: Option<String>,
  command_resolution: PreviewCommandResolutionPayload,
}

impl PreviewRuntimeState {
  fn to_payload(&self) -> PreviewStatePayload {
    PreviewStatePayload {
      status: self.status.clone(),
      workspace_path: Some(self.workspace_path.clone()),
      command: Some(self.command.clone()),
      url: self.url.clone(),
      last_error: self.last_error.clone(),
      pid: self.pid,
      last_started_at: self.last_started_at.clone(),
      command_resolution: Some(self.command_resolution.clone()),
    }
  }
}

struct PreviewProcess {
  app_handle: AppHandle,
  child: Mutex<Child>,
  state: Mutex<PreviewRuntimeState>,
  stopping: AtomicBool,
}

impl PreviewProcess {
  fn start(
    app_handle: AppHandle,
    workspace_path: String,
    command: ResolvedPreviewCommand,
  ) -> Result<Arc<Self>, String> {
    let mut process_command = command.to_command();
    process_command
      .current_dir(&workspace_path)
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());

    let mut child = process_command.spawn().map_err(|error| {
      format!(
        "Could not start preview command `{}`: {error}",
        command.display_command
      )
    })?;
    let pid = child.id();
    let stdout = child
      .stdout
      .take()
      .ok_or_else(|| "Preview command did not expose stdout.".to_string())?;
    let stderr = child
      .stderr
      .take()
      .ok_or_else(|| "Preview command did not expose stderr.".to_string())?;

    let process = Arc::new(Self {
      app_handle: app_handle.clone(),
      child: Mutex::new(child),
      state: Mutex::new(PreviewRuntimeState {
        status: "booting".to_string(),
        workspace_path,
        command: command.display_command.clone(),
        url: command.default_url.clone(),
        last_error: None,
        pid: Some(pid),
        last_started_at: Some(current_timestamp_string()),
        command_resolution: command.resolution,
      }),
      stopping: AtomicBool::new(false),
    });

    process.emit_state();
    process.spawn_stdout_pump(stdout);
    process.spawn_stderr_pump(stderr);
    process.spawn_readiness_probe();
    process.spawn_exit_watcher();
    Ok(process)
  }

  fn snapshot(&self) -> PreviewStatePayload {
    self.state.lock().expect("preview lock poisoned").to_payload()
  }

  fn stop(&self) -> Result<(), String> {
    self.stopping.store(true, Ordering::SeqCst);
    let pid = self.child.lock().expect("preview child lock poisoned").id();
    kill_process_tree(pid)
  }

  fn spawn_stdout_pump(self: &Arc<Self>, stdout: impl Read + Send + 'static) {
    let preview = Arc::clone(self);
    thread::spawn(move || {
      let reader = BufReader::new(stdout);
      for line in reader.lines() {
        let Ok(line) = line else {
          break;
        };
        if let Some(url) = detect_preview_url(&line) {
          let changed = preview.update_state(|state| {
            if state.url.as_deref() != Some(url.as_str()) {
              state.url = Some(url.clone());
              true
            } else {
              false
            }
          });
          if changed {
            preview.emit_state();
          }
        }
      }
    });
  }

  fn spawn_stderr_pump(self: &Arc<Self>, stderr: impl Read + Send + 'static) {
    let preview = Arc::clone(self);
    thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines() {
        let Ok(line) = line else {
          break;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
          continue;
        }
        if let Some(url) = detect_preview_url(trimmed) {
          let changed = preview.update_state(|state| {
            if state.url.as_deref() != Some(url.as_str()) {
              state.url = Some(url.clone());
              true
            } else {
              false
            }
          });
          if changed {
            preview.emit_state();
          }
          continue;
        }
        let changed = preview.update_state(|state| {
          if state.status == "ready" {
            false
          } else {
            state.last_error = Some(trimmed.to_string());
            true
          }
        });
        if changed {
          preview.emit_state();
        }
      }
    });
  }

  fn spawn_readiness_probe(self: &Arc<Self>) {
    let preview = Arc::clone(self);
    thread::spawn(move || {
      let start = SystemTime::now();
      loop {
        if preview.stopping.load(Ordering::SeqCst) {
          break;
        }
        let snapshot = preview.snapshot();
        if snapshot.status == "ready" || snapshot.status == "crashed" {
          break;
        }
        if let Some(url) = snapshot.url.as_deref() {
          if preview_url_ready(url) {
            let changed = preview.update_state(|state| {
              state.status = "ready".to_string();
              state.last_error = None;
              true
            });
            if changed {
              preview.emit_state();
            }
            break;
          }
        }
        if elapsed(start) >= Duration::from_secs(PREVIEW_READY_TIMEOUT_SECONDS) {
          let changed = preview.update_state(|state| {
            state.status = "crashed".to_string();
            state.last_error = Some("Preview server did not become reachable.".to_string());
            true
          });
          if changed {
            preview.emit_state();
          }
          let _ = preview.stop();
          break;
        }
        thread::sleep(Duration::from_millis(PREVIEW_POLL_INTERVAL_MILLIS));
      }
    });
  }

  fn spawn_exit_watcher(self: &Arc<Self>) {
    let preview = Arc::clone(self);
    thread::spawn(move || loop {
      if preview.stopping.load(Ordering::SeqCst) {
        break;
      }
      let exit_status = {
        let mut child = preview.child.lock().expect("preview child lock poisoned");
        match child.try_wait() {
          Ok(Some(status)) => Some(status),
          Ok(None) => None,
          Err(error) => {
            let changed = preview.update_state(|state| {
              state.status = "crashed".to_string();
              state.last_error = Some(format!("Could not watch preview process: {error}"));
              state.pid = None;
              true
            });
            if changed {
              preview.emit_state();
            }
            break;
          }
        }
      };

      if let Some(status) = exit_status {
        if !preview.stopping.load(Ordering::SeqCst) {
          let changed = preview.update_state(|state| {
            state.status = "crashed".to_string();
            state.last_error = Some(format!("Preview process exited unexpectedly with status {status}."));
            state.pid = None;
            true
          });
          if changed {
            preview.emit_state();
          }
        }
        break;
      }

      thread::sleep(Duration::from_millis(250));
    });
  }

  fn update_state<F>(&self, updater: F) -> bool
  where
    F: FnOnce(&mut PreviewRuntimeState) -> bool,
  {
    let mut state = self.state.lock().expect("preview lock poisoned");
    updater(&mut state)
  }

  fn emit_state(&self) {
    let payload = self.snapshot();
    emit_event(
      &self.app_handle,
      "preview/state",
      payload.last_error.clone(),
      None,
      Some(payload.status.clone()),
      None,
      None,
      None,
      Some(payload),
      None,
    );
  }
}

struct AppState {
  settings: Arc<SettingsStore>,
  session: Mutex<Option<Arc<CodexSession>>>,
  preview: Mutex<Option<Arc<PreviewProcess>>>,
  app_handle: AppHandle,
}

impl AppState {
  fn new(app_handle: AppHandle, settings: Arc<SettingsStore>) -> Self {
    Self {
      settings,
      session: Mutex::new(None),
      preview: Mutex::new(None),
      app_handle,
    }
  }

  fn session_snapshot(&self) -> SessionStatePayload {
    self
      .session
      .lock()
      .expect("session lock poisoned")
      .as_ref()
      .map(|session| session.snapshot())
      .unwrap_or_else(disconnected_session_payload)
  }

  fn preview_snapshot(&self) -> PreviewStatePayload {
    if let Some(preview) = self.preview.lock().expect("preview lock poisoned").as_ref() {
      return preview.snapshot();
    }

    let settings = self.settings.snapshot();
    idle_preview_state_for_workspace(
      settings.workspace_path.clone(),
      settings.preview_command.clone(),
    )
  }

  fn current_session(&self) -> Option<Arc<CodexSession>> {
    self.session.lock().expect("session lock poisoned").clone()
  }

  async fn disconnect_active_session(&self) -> Result<SessionStatePayload, String> {
    let session = self.session.lock().expect("session lock poisoned").take();
    if let Some(session) = session {
      session.shutdown(None)?;
    }
    Ok(disconnected_session_payload())
  }

  fn disconnect_active_preview(&self) -> Result<PreviewStatePayload, String> {
    let preview = self.preview.lock().expect("preview lock poisoned").take();
    if let Some(preview) = preview {
      let _ = preview.stop();
    }
    Ok(self.preview_snapshot())
  }

  async fn connect(
    &self,
    workspace_path: String,
    requested_model: Option<String>,
  ) -> Result<SessionStatePayload, String> {
    let normalized_workspace = normalize_optional_string(Some(workspace_path.clone()))
      .ok_or_else(|| "Workspace path is required.".to_string())?;
    let workspace = Path::new(&normalized_workspace);
    if !workspace.is_dir() {
      return Err("Workspace path must point to an existing folder.".to_string());
    }
    let codex_workspace_path = resolve_codex_workspace_path(workspace)?;
    let runtime_paths = codex_runtime_paths(&self.app_handle, &codex_workspace_path)?;

    let desired_model = normalize_optional_string(requested_model);

    let _ = self.disconnect_active_session().await?;
    self.settings.update(|settings| {
      settings.workspace_path = Some(normalized_workspace.clone());
      if desired_model.is_some() {
        settings.default_model = desired_model.clone();
      }
    })?;

    let settings = self.settings.snapshot();
    let active_model = desired_model.or_else(|| settings.default_model.clone());
    let codex_status = probe_codex_status(&settings)?;
    if codex_status.status != "ready" {
      return Err(codex_status.message);
    }

    let session = CodexSession::start(
      self.app_handle.clone(),
      &settings,
      normalized_workspace,
      codex_workspace_path,
      runtime_paths,
      active_model,
    )
    .await?;
    let snapshot = session.snapshot();
    *self.session.lock().expect("session lock poisoned") = Some(session);
    Ok(snapshot)
  }

  async fn send_turn(&self, input: SendTurnInput) -> Result<TurnAck, String> {
    let text = normalize_optional_string(Some(input.text))
      .ok_or_else(|| "Prompt text cannot be empty.".to_string())?;
    let requested_model = normalize_optional_string(input.model);

    if requested_model.is_some() {
      self
        .settings
        .update(|settings| settings.default_model = requested_model.clone())?;
    }

    let current_session = self
      .current_session()
      .ok_or_else(|| "Connect to Codex before sending a prompt.".to_string())?;
    let current_runtime = current_session.snapshot();
    let desired_model = requested_model.or_else(|| current_runtime.active_model.clone());
    let active_model = current_runtime.active_model.clone();

    if desired_model != active_model {
      let workspace_path = current_runtime
        .workspace_path
        .ok_or_else(|| "Codex session is missing its workspace path.".to_string())?;
      let _ = self.connect(workspace_path, desired_model.clone()).await?;
    }

    let session = self
      .current_session()
      .ok_or_else(|| "Connect to Codex before sending a prompt.".to_string())?;
    session.send_turn(text).await
  }

  fn start_preview(&self) -> Result<PreviewStatePayload, String> {
    let settings = self.settings.snapshot();
    let workspace_path = settings
      .workspace_path
      .clone()
      .ok_or_else(|| "Pick a workspace before starting the preview.".to_string())?;
    let resolved = resolve_preview_command(Path::new(&workspace_path), settings.preview_command.as_deref())?;
    let Some(resolved) = resolved else {
      return Ok(idle_preview_state_for_workspace(
        Some(workspace_path),
        settings.preview_command,
      ));
    };

    let _ = self.disconnect_active_preview()?;
    let preview = PreviewProcess::start(self.app_handle.clone(), workspace_path, resolved)?;
    let snapshot = preview.snapshot();
    *self.preview.lock().expect("preview lock poisoned") = Some(preview);
    Ok(snapshot)
  }

  fn restart_preview(&self) -> Result<PreviewStatePayload, String> {
    let _ = self.disconnect_active_preview()?;
    self.start_preview()
  }
}

#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<BootstrapState, String> {
  let settings = state.settings.snapshot();
  Ok(BootstrapState {
    workspace_path: settings.workspace_path.clone(),
    codex_binary_path: settings.codex_binary_path.clone(),
    codex_home_path: settings.codex_home_path.clone(),
    default_model: settings.default_model.clone(),
    preview_command: settings.preview_command.clone(),
    codex_status: probe_codex_status(&settings)?,
    preview: state.preview_snapshot(),
    session: state.session_snapshot(),
  })
}

#[tauri::command]
async fn pick_workspace(state: State<'_, AppState>) -> Result<WorkspaceSelection, String> {
  let settings = state.settings.snapshot();
  let mut dialog = FileDialog::new();
  if let Some(existing) = settings.workspace_path.as_ref() {
    dialog = dialog.set_directory(existing);
  }

  let selected = dialog.pick_folder();
  let workspace_path = selected
    .as_ref()
    .map(|path| path.to_string_lossy().to_string());
  if workspace_path.is_some() {
    let _ = state.disconnect_active_session().await?;
    let _ = state.disconnect_active_preview()?;
    state
      .settings
      .update(|settings| settings.workspace_path = workspace_path.clone())?;
  }

  Ok(WorkspaceSelection { workspace_path })
}

#[tauri::command]
async fn refresh_codex_status(state: State<'_, AppState>) -> Result<CodexStatus, String> {
  let settings = state.settings.snapshot();
  probe_codex_status(&settings)
}

#[tauri::command]
async fn refresh_preview_state(state: State<'_, AppState>) -> Result<PreviewStatePayload, String> {
  Ok(state.preview_snapshot())
}

#[tauri::command]
async fn update_codex_settings(
  state: State<'_, AppState>,
  input: CodexSettingsInput,
) -> Result<BootstrapState, String> {
  let settings = state.settings.update(|settings| {
    settings.codex_binary_path = normalize_optional_string(input.codex_binary_path.clone());
    settings.codex_home_path = normalize_optional_string(input.codex_home_path.clone());
    settings.default_model = normalize_optional_string(input.default_model.clone());
    settings.preview_command = normalize_optional_string(input.preview_command.clone());
  })?;

  Ok(BootstrapState {
    workspace_path: settings.workspace_path.clone(),
    codex_binary_path: settings.codex_binary_path.clone(),
    codex_home_path: settings.codex_home_path.clone(),
    default_model: settings.default_model.clone(),
    preview_command: settings.preview_command.clone(),
    codex_status: probe_codex_status(&settings)?,
    preview: state.preview_snapshot(),
    session: state.session_snapshot(),
  })
}

#[tauri::command]
async fn connect_codex(
  state: State<'_, AppState>,
  input: ConnectCodexInput,
) -> Result<SessionStatePayload, String> {
  state.connect(input.workspace_path, input.model).await
}

#[tauri::command]
async fn disconnect_codex(state: State<'_, AppState>) -> Result<SessionStatePayload, String> {
  state.disconnect_active_session().await
}

#[tauri::command]
async fn start_preview(state: State<'_, AppState>) -> Result<PreviewStatePayload, String> {
  state.start_preview()
}

#[tauri::command]
async fn stop_preview(state: State<'_, AppState>) -> Result<PreviewStatePayload, String> {
  state.disconnect_active_preview()
}

#[tauri::command]
async fn restart_preview(state: State<'_, AppState>) -> Result<PreviewStatePayload, String> {
  state.restart_preview()
}

#[tauri::command]
async fn open_preview_in_browser(url: String) -> Result<(), String> {
  open_url_in_system_browser(&url)
}

#[tauri::command]
async fn send_turn(
  state: State<'_, AppState>,
  input: SendTurnInput,
) -> Result<TurnAck, String> {
  state.send_turn(input).await
}

#[tauri::command]
async fn interrupt_turn(state: State<'_, AppState>) -> Result<TurnAck, String> {
  let session = state
    .current_session()
    .ok_or_else(|| "Connect to Codex before interrupting a turn.".to_string())?;
  session.interrupt_turn().await
}

fn disconnected_session_payload() -> SessionStatePayload {
  SessionStatePayload {
    connected: false,
    status: "disconnected".to_string(),
    workspace_path: None,
    provider_thread_id: None,
    active_turn_id: None,
    last_error: None,
    active_model: None,
  }
}

#[allow(clippy::too_many_arguments)]
fn emit_event(
  app_handle: &AppHandle,
  method: &str,
  message: Option<String>,
  delta: Option<String>,
  status: Option<String>,
  turn_id: Option<String>,
  thread_id: Option<String>,
  active_model: Option<String>,
  preview: Option<PreviewStatePayload>,
  change_summary: Option<WorkspaceChangeSummaryPayload>,
) {
  let payload = CodexEventEnvelope {
    id: Uuid::new_v4().to_string(),
    method: method.to_string(),
    message,
    delta,
    status,
    turn_id,
    thread_id,
    active_model,
    preview,
    change_summary,
  };

  let _ = app_handle.emit(CODEX_EVENT_NAME, payload);
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
  value.and_then(|value| {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed.to_string())
    }
  })
}

fn resolve_codex_workspace_path(path: &Path) -> Result<String, String> {
  #[cfg(windows)]
  {
    let workspace = path.to_string_lossy().into_owned();
    if workspace.is_ascii() {
      return Ok(workspace);
    }

    if let Some(short_path) = windows_short_path(path)? {
      return Ok(short_path);
    }

    Err(
      "Codex CLI could not open this Windows folder because its path contains non-ASCII characters and no short-path alias was available. Move the workspace to an ASCII-only path or enable 8.3 short names, then try again."
        .to_string(),
    )
  }

  #[cfg(not(windows))]
  {
    Ok(path.to_string_lossy().into_owned())
  }
}

#[cfg(windows)]
fn windows_short_path(path: &Path) -> Result<Option<String>, String> {
  let wide_path = path
    .as_os_str()
    .encode_wide()
    .chain(std::iter::once(0))
    .collect::<Vec<u16>>();
  let required = unsafe { GetShortPathNameW(wide_path.as_ptr(), std::ptr::null_mut(), 0) };

  if required == 0 {
    return Ok(None);
  }

  let mut buffer = vec![0; required as usize];
  let written = unsafe { GetShortPathNameW(wide_path.as_ptr(), buffer.as_mut_ptr(), required) };
  if written == 0 {
    return Err(format!(
      "Could not resolve a Windows short path for `{}`: {}",
      path.display(),
      std::io::Error::last_os_error()
    ));
  }

  let short_path = OsString::from_wide(&buffer[..written as usize])
    .to_string_lossy()
    .into_owned();
  if short_path.is_empty() {
    return Ok(None);
  }

  Ok(Some(short_path))
}

#[derive(Clone, Debug)]
struct ResolvedCodexCommand {
  executable: String,
  launcher_args: Vec<String>,
  display_path: String,
}

impl ResolvedCodexCommand {
  fn apply_args(&self, command: &mut Command, global_args: &[String], args: &[&str]) {
    command.args(&self.launcher_args);

    if self.executable.eq_ignore_ascii_case("cmd.exe") {
      let mut tokens = vec![self.display_path.clone()];
      tokens.extend(global_args.iter().cloned());
      tokens.extend(args.iter().map(|arg| arg.to_string()));
      command.arg(build_cmd_invocation_tokens(&tokens));
      return;
    }

    command.args(global_args);
    command.args(args);
  }
}

fn configured_codex_binary_path(settings: &PersistedSettings) -> Option<String> {
  settings
    .codex_binary_path
    .clone()
    .filter(|value| !value.trim().is_empty())
}

fn resolve_codex_command(settings: &PersistedSettings) -> ResolvedCodexCommand {
  if let Some(configured_path) = configured_codex_binary_path(settings) {
    return wrap_codex_command(configured_path);
  }

  #[cfg(windows)]
  {
    if let Some(detected_path) = detect_windows_codex_binary_path() {
      return wrap_codex_command(detected_path);
    }
  }

  wrap_codex_command("codex".to_string())
}

fn wrap_codex_command(display_path: String) -> ResolvedCodexCommand {
  #[cfg(windows)]
  {
    if let Some(npm_command) = resolve_windows_npm_codex_command(&display_path) {
      return npm_command;
    }

    let lower = display_path.to_ascii_lowercase();

    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
      return ResolvedCodexCommand {
        executable: "cmd.exe".to_string(),
        launcher_args: vec!["/d".to_string(), "/s".to_string(), "/c".to_string()],
        display_path,
      };
    }

    if lower.ends_with(".ps1") {
      return ResolvedCodexCommand {
        executable: "powershell.exe".to_string(),
        launcher_args: vec![
          "-NoLogo".to_string(),
          "-NoProfile".to_string(),
          "-ExecutionPolicy".to_string(),
          "Bypass".to_string(),
          "-File".to_string(),
          display_path.clone(),
        ],
        display_path,
      };
    }
  }

  ResolvedCodexCommand {
    executable: display_path.clone(),
    launcher_args: Vec::new(),
    display_path,
  }
}

#[cfg(windows)]
fn resolve_windows_npm_codex_command(display_path: &str) -> Option<ResolvedCodexCommand> {
  let shim_path = Path::new(display_path);
  let shim_dir = shim_path.parent()?;
  let codex_js = shim_dir
    .join("node_modules")
    .join("@openai")
    .join("codex")
    .join("bin")
    .join("codex.js");

  if !codex_js.exists() {
    return None;
  }

  let bundled_node = shim_dir.join("node.exe");
  let executable = if bundled_node.exists() {
    bundled_node.to_string_lossy().into_owned()
  } else {
    "node".to_string()
  };

  Some(ResolvedCodexCommand {
    executable,
    launcher_args: vec![codex_js.to_string_lossy().into_owned()],
    display_path: display_path.to_string(),
  })
}

#[cfg(windows)]
fn detect_windows_codex_binary_path() -> Option<String> {
  let where_output = Command::new("where.exe").arg("codex").output().ok()?;

  if where_output.status.success() {
    let stdout = String::from_utf8_lossy(&where_output.stdout);
    for line in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
      let lower = line.to_ascii_lowercase();
      if lower.ends_with(".cmd") || lower.ends_with(".exe") || lower.ends_with(".bat") {
        return Some(line.to_string());
      }
    }
    if let Some(first) = stdout.lines().map(str::trim).find(|line| !line.is_empty()) {
      return Some(first.to_string());
    }
  }

  let appdata = env::var("APPDATA").ok()?;
  let npm_dir = Path::new(&appdata).join("npm");
  let codex_cmd = npm_dir.join("codex.cmd");
  if codex_cmd.exists() {
    return Some(codex_cmd.to_string_lossy().into_owned());
  }

  let codex_exe = npm_dir.join("codex.exe");
  if codex_exe.exists() {
    return Some(codex_exe.to_string_lossy().into_owned());
  }

  let codex_ps1 = npm_dir.join("codex.ps1");
  if codex_ps1.exists() {
    return Some(codex_ps1.to_string_lossy().into_owned());
  }

  None
}

fn build_cmd_invocation_tokens(tokens: &[String]) -> String {
  let parts = tokens.iter().map(|token| quote_cmd_token(token)).collect::<Vec<_>>();
  format!("\"{}\"", parts.join(" "))
}

fn quote_cmd_token(token: &str) -> String {
  if token.contains([' ', '\t', '"']) {
    format!("\"{}\"", token.replace('"', "\"\""))
  } else {
    token.to_string()
  }
}

fn build_codex_global_args(model: Option<&str>) -> Vec<String> {
  let mut args = Vec::new();
  if let Some(model) = model.filter(|value| !value.trim().is_empty()) {
    args.push("-m".to_string());
    args.push(model.to_string());
  }
  args
}

fn build_codex_command(
  settings: &PersistedSettings,
  global_args: &[String],
  args: &[&str],
) -> (Command, String) {
  let resolved = resolve_codex_command(settings);
  let mut command = Command::new(&resolved.executable);
  resolved.apply_args(&mut command, global_args, args);
  if let Some(home_path) = settings.codex_home_path.as_deref() {
    command.env("CODEX_HOME", home_path);
  }
  (command, resolved.display_path)
}

fn spawn_codex_command(
  settings: &PersistedSettings,
  args: &[&str],
) -> Result<std::process::Output, String> {
  let (mut command, binary_path) = build_codex_command(settings, &[], args);
  command.stdout(Stdio::piped()).stderr(Stdio::piped());
  command
    .output()
    .map_err(|error| format!("Could not execute Codex CLI at `{binary_path}`: {error}"))
}

fn probe_codex_status(settings: &PersistedSettings) -> Result<CodexStatus, String> {
  let binary_path = resolve_codex_command(settings).display_path;

  let version_output = match spawn_codex_command(settings, &["--version"]) {
    Ok(output) => output,
    Err(error) => {
      return Ok(CodexStatus {
        status: "notInstalled".to_string(),
        version: None,
        message: format!("Codex CLI was not found at `{binary_path}`. {error}"),
        binary_path,
        home_path: settings.codex_home_path.clone(),
      })
    }
  };

  if !version_output.status.success() {
    return Ok(CodexStatus {
      status: "error".to_string(),
      version: None,
      message: format!(
        "Codex CLI failed the version check. {}",
        combined_output(&version_output)
      ),
      binary_path,
      home_path: settings.codex_home_path.clone(),
    });
  }

  let version = combined_output(&version_output);
  let login_output = spawn_codex_command(settings, &["login", "status"])?;
  let login_text = combined_output(&login_output);
  let lower = login_text.to_lowercase();

  if lower.contains("not logged in")
    || lower.contains("login required")
    || lower.contains("authentication required")
    || lower.contains("run `codex login`")
    || lower.contains("run codex login")
  {
    return Ok(CodexStatus {
      status: "unauthenticated".to_string(),
      version: Some(version),
      message: "Codex CLI is installed but not authenticated. Run `codex login`, then refresh."
        .to_string(),
      binary_path,
      home_path: settings.codex_home_path.clone(),
    });
  }

  if login_output.status.success() {
    return Ok(CodexStatus {
      status: "ready".to_string(),
      version: Some(version),
      message: "Codex CLI is installed and authenticated.".to_string(),
      binary_path,
      home_path: settings.codex_home_path.clone(),
    });
  }

  Ok(CodexStatus {
    status: "error".to_string(),
    version: Some(version),
    message: format!("Codex CLI is installed but the auth probe failed. {login_text}"),
    binary_path,
    home_path: settings.codex_home_path.clone(),
  })
}

fn combined_output(output: &std::process::Output) -> String {
  let stdout = String::from_utf8_lossy(&output.stdout);
  let stderr = String::from_utf8_lossy(&output.stderr);
  format!("{stdout}\n{stderr}").trim().to_string()
}

fn parse_response_id(value: &Value) -> Option<u64> {
  let id = value.get("id")?;
  match id {
    Value::Number(number) => number.as_u64(),
    Value::String(string) => string.parse::<u64>().ok(),
    _ => None,
  }
}

fn extract_error_message(error: &Value) -> String {
  error
    .get("message")
    .and_then(Value::as_str)
    .map(str::to_owned)
    .unwrap_or_else(|| "Codex request failed.".to_string())
}

fn kill_process_tree(pid: u32) -> Result<(), String> {
  #[cfg(windows)]
  {
    let status = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/T", "/F"])
      .status()
      .map_err(|error| format!("Could not stop process tree: {error}"))?;
    if status.success() {
      Ok(())
    } else {
      Err(format!("taskkill exited unsuccessfully for pid {pid}."))
    }
  }

  #[cfg(not(windows))]
  {
    let status = Command::new("kill")
      .args(["-TERM", &pid.to_string()])
      .status()
      .map_err(|error| format!("Could not stop process: {error}"))?;
    if status.success() {
      Ok(())
    } else {
      Err(format!("kill exited unsuccessfully for pid {pid}."))
    }
  }
}

fn settings_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
  let config_dir = app_handle
    .path()
    .app_config_dir()
    .map_err(|error| format!("Could not resolve app config directory: {error}"))?;
  fs::create_dir_all(&config_dir)
    .map_err(|error| format!("Could not create app config directory: {error}"))?;
  Ok(config_dir.join(SETTINGS_FILE_NAME))
}

fn codex_runtime_paths(
  app_handle: &AppHandle,
  codex_workspace_path: &str,
) -> Result<CodexRuntimePaths, String> {
  let runtime_root = app_handle
    .path()
    .app_local_data_dir()
    .map_err(|error| format!("Could not resolve app local data directory: {error}"))?
    .join(CODEX_RUNTIME_DIR_NAME)
    .join(stable_workspace_token(codex_workspace_path));
  let cache_root = runtime_root.join(CODEX_RUNTIME_CACHE_DIR_NAME);
  let temp_root = runtime_root.join(CODEX_RUNTIME_TEMP_DIR_NAME);

  fs::create_dir_all(&cache_root)
    .map_err(|error| format!("Could not create Codex npm cache directory: {error}"))?;
  fs::create_dir_all(&temp_root)
    .map_err(|error| format!("Could not create Codex temp directory: {error}"))?;

  let cache_root = cache_root.to_string_lossy().into_owned();
  let temp_root = temp_root.to_string_lossy().into_owned();

  Ok(CodexRuntimePaths {
    cache_root,
    temp_root,
  })
}

fn stable_workspace_token(workspace_path: &str) -> String {
  let mut hasher = DefaultHasher::new();
  workspace_path.hash(&mut hasher);
  format!("{:016x}", hasher.finish())
}

fn apply_codex_runtime_env(command: &mut Command, runtime_paths: &CodexRuntimePaths) {
  command.env("NPM_CONFIG_CACHE", &runtime_paths.cache_root);
  command.env("npm_config_cache", &runtime_paths.cache_root);
  command.env("npm_config_tmp", &runtime_paths.temp_root);
  command.env("TMP", &runtime_paths.temp_root);
  command.env("TEMP", &runtime_paths.temp_root);
  command.env("TMPDIR", &runtime_paths.temp_root);
}

fn resolve_preview_command(
  workspace_path: &Path,
  manual_command: Option<&str>,
) -> Result<Option<ResolvedPreviewCommand>, String> {
  if let Some(manual_command) = manual_command.filter(|value| !value.trim().is_empty()) {
    let tokens = parse_command_line(manual_command)?;
    let Some((first, rest)) = tokens.split_first() else {
      return Err("Preview command is empty.".to_string());
    };
    let default_url =
      detect_url_from_command_tokens(&tokens).or_else(|| infer_preview_url_from_tokens(&tokens));
    return Ok(Some(ResolvedPreviewCommand {
      executable: preview_executable(first),
      args: rest.to_vec(),
      display_command: manual_command.to_string(),
      default_url: default_url.clone(),
      resolution: PreviewCommandResolutionPayload {
        source: "manual".to_string(),
        label: "Manual preview command".to_string(),
        command: Some(manual_command.to_string()),
        default_url,
      },
    }));
  }

  let package_json_path = workspace_path.join("package.json");
  if package_json_path.exists() {
    let manifest = read_json_file(&package_json_path)?;
    if manifest_has_dependency(&manifest, "expo") || workspace_has_expo_config(workspace_path) {
      return Ok(Some(ResolvedPreviewCommand {
        executable: preview_executable("npx"),
        args: vec![
          "expo".to_string(),
          "start".to_string(),
          "--web".to_string(),
          "--port".to_string(),
          "8081".to_string(),
        ],
        display_command: "npx expo start --web --port 8081".to_string(),
        default_url: Some("http://127.0.0.1:8081".to_string()),
        resolution: PreviewCommandResolutionPayload {
          source: "expo".to_string(),
          label: "Expo web preview".to_string(),
          command: Some("npx expo start --web --port 8081".to_string()),
          default_url: Some("http://127.0.0.1:8081".to_string()),
        },
      }));
    }

    if let Some((candidate, script_body)) = resolve_npm_preview_script(&manifest) {
      let display_command = format!("npm run {}", candidate.script_name);
      let inferred_default_url = infer_preview_url_from_script(script_body);
      return Ok(Some(ResolvedPreviewCommand {
        executable: preview_executable("npm"),
        args: vec!["run".to_string(), candidate.script_name.to_string()],
        display_command: display_command.clone(),
        default_url: inferred_default_url.clone(),
        resolution: PreviewCommandResolutionPayload {
          source: candidate.source.to_string(),
          label: candidate.label.to_string(),
          command: Some(display_command),
          default_url: inferred_default_url,
        },
      }));
    }
  }

  Ok(None)
}

fn idle_preview_state_for_workspace(
  workspace_path: Option<String>,
  manual_command: Option<String>,
) -> PreviewStatePayload {
  match workspace_path {
    Some(workspace_path) => match resolve_preview_command(Path::new(&workspace_path), manual_command.as_deref()) {
      Ok(Some(command)) => PreviewStatePayload {
        status: "idle".to_string(),
        workspace_path: Some(workspace_path),
        command: Some(command.display_command),
        url: command.default_url,
        last_error: None,
        pid: None,
        last_started_at: None,
        command_resolution: Some(command.resolution),
      },
      Ok(None) => PreviewStatePayload {
        status: "idle".to_string(),
        workspace_path: Some(workspace_path),
        command: None,
        url: None,
        last_error: Some("No preview command detected for this workspace.".to_string()),
        pid: None,
        last_started_at: None,
        command_resolution: Some(PreviewCommandResolutionPayload {
          source: "none".to_string(),
          label: "No preview command detected".to_string(),
          command: None,
          default_url: None,
        }),
      },
      Err(error) => PreviewStatePayload {
        status: "crashed".to_string(),
        workspace_path: Some(workspace_path),
        command: manual_command,
        url: None,
        last_error: Some(error),
        pid: None,
        last_started_at: None,
        command_resolution: Some(PreviewCommandResolutionPayload {
          source: "manual".to_string(),
          label: "Manual preview command".to_string(),
          command: None,
          default_url: None,
        }),
      },
    },
    None => PreviewStatePayload {
      status: "idle".to_string(),
      workspace_path: None,
      command: None,
      url: None,
      last_error: None,
      pid: None,
      last_started_at: None,
      command_resolution: None,
    },
  }
}

fn parse_command_line(input: &str) -> Result<Vec<String>, String> {
  let mut tokens = Vec::new();
  let mut current = String::new();
  let mut in_single = false;
  let mut in_double = false;
  let mut chars = input.chars().peekable();

  while let Some(ch) = chars.next() {
    match ch {
      '\'' if !in_double => in_single = !in_single,
      '"' if !in_single => in_double = !in_double,
      '\\' if in_double => {
        if let Some(next) = chars.next() {
          current.push(next);
        }
      }
      c if c.is_whitespace() && !in_single && !in_double => {
        if !current.is_empty() {
          tokens.push(current.clone());
          current.clear();
        }
      }
      _ => current.push(ch),
    }
  }

  if in_single || in_double {
    return Err("Preview command has unmatched quotes.".to_string());
  }

  if !current.is_empty() {
    tokens.push(current);
  }

  Ok(tokens)
}

fn preview_executable(name: &str) -> String {
  #[cfg(windows)]
  {
    if name.eq_ignore_ascii_case("npm") || name.eq_ignore_ascii_case("npx") {
      return format!("{name}.cmd");
    }
  }

  name.to_string()
}

fn detect_url_from_command_tokens(tokens: &[String]) -> Option<String> {
  if let Some(url) = tokens
    .iter()
    .find(|token| token.starts_with("http://") || token.starts_with("https://"))
  {
    return Some(url.clone());
  }

  if let Some(port) = extract_port_flag(tokens) {
    let host = extract_host_flag(tokens).unwrap_or_else(|| "127.0.0.1".to_string());
    let normalized_host = normalize_preview_host_for_url(&host);
    return Some(format!("http://{normalized_host}:{port}"));
  }

  None
}

fn extract_port_flag(tokens: &[String]) -> Option<String> {
  extract_flag_value(tokens, &["--port", "-p"])
}

fn extract_host_flag(tokens: &[String]) -> Option<String> {
  extract_flag_value(tokens, &["--host", "--hostname", "-h", "-H"])
}

fn extract_flag_value(tokens: &[String], flags: &[&str]) -> Option<String> {
  if let Some(value) = tokens.iter().find_map(|token| {
    flags.iter().find_map(|flag| {
      token
        .strip_prefix(flag)
        .and_then(|rest| rest.strip_prefix('='))
        .map(|value| value.to_string())
    })
  }) {
    return Some(value);
  }

  tokens.windows(2).find_map(|window| {
    flags
      .iter()
      .any(|flag| window[0] == *flag)
      .then(|| window[1].clone())
  })
}

fn infer_preview_url_from_script(script: &str) -> Option<String> {
  parse_command_line(script)
    .ok()
    .and_then(|tokens| {
      detect_url_from_command_tokens(&tokens).or_else(|| infer_preview_url_from_tokens(&tokens))
    })
}

fn infer_preview_url_from_tokens(tokens: &[String]) -> Option<String> {
  let host = extract_host_flag(tokens).unwrap_or_else(|| "127.0.0.1".to_string());
  let normalized_host = normalize_preview_host_for_url(&host);
  let port = extract_port_flag(tokens).or_else(|| infer_default_preview_port(tokens))?;
  Some(format!("http://{normalized_host}:{port}"))
}

fn infer_default_preview_port(tokens: &[String]) -> Option<String> {
  let has_token = |expected: &str| tokens.iter().any(|token| token_matches_command(token, expected));

  if has_token("expo") && tokens.iter().any(|token| token == "--web") {
    return Some("8081".to_string());
  }

  if has_token("vite") {
    if tokens.iter().any(|token| token.eq_ignore_ascii_case("preview")) {
      return Some("4173".to_string());
    }

    return Some("5173".to_string());
  }

  if has_token("next") {
    return Some("3000".to_string());
  }

  if has_token("react-scripts") {
    return Some("3000".to_string());
  }

  if has_token("webpack") {
    return Some("8080".to_string());
  }

  None
}

fn token_matches_command(token: &str, expected: &str) -> bool {
  if token.eq_ignore_ascii_case(expected) {
    return true;
  }

  Path::new(token)
    .file_stem()
    .and_then(|stem| stem.to_str())
    .map(|stem| stem.eq_ignore_ascii_case(expected))
    .unwrap_or(false)
}

fn normalize_preview_host_for_url(host: &str) -> String {
  let trimmed = host.trim();
  if trimmed.is_empty() || trimmed == "0.0.0.0" || trimmed == "::" || trimmed == "[::]" {
    return "127.0.0.1".to_string();
  }

  trimmed
    .trim_matches(|character| character == '[' || character == ']')
    .to_string()
}

fn resolve_npm_preview_script(manifest: &Value) -> Option<(PreviewScriptCandidate, &str)> {
  PREVIEW_SCRIPT_CANDIDATES.iter().find_map(|candidate| {
    if !manifest_has_script(manifest, candidate.script_name) {
      return None;
    }

    manifest
      .get("scripts")
      .and_then(|scripts| scripts.get(candidate.script_name))
      .and_then(Value::as_str)
      .map(|script_body| (*candidate, script_body))
  })
}

fn open_url_in_system_browser(url: &str) -> Result<(), String> {
  let normalized = normalize_browser_open_url(url)?;

  #[cfg(target_os = "windows")]
  {
    let operation = "open\0".encode_utf16().collect::<Vec<u16>>();
    let target = format!("{normalized}\0").encode_utf16().collect::<Vec<u16>>();
    let result = unsafe {
      ShellExecuteW(
        std::ptr::null_mut(),
        operation.as_ptr(),
        target.as_ptr(),
        std::ptr::null(),
        std::ptr::null(),
        SW_SHOWNORMAL,
      )
    } as isize;

    if result <= 32 {
      return Err(format!(
        "Could not open the preview URL in your browser: Windows shell error {result}."
      ));
    }

    Ok(())
  }

  #[cfg(target_os = "macos")]
  {
    let mut command = Command::new("open");
    command.arg(&normalized);
    return command
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .map(|_| ())
      .map_err(|error| format!("Could not open the preview URL in your browser: {error}"));
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let mut command = Command::new("xdg-open");
    command.arg(&normalized);
    return command
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .map(|_| ())
      .map_err(|error| format!("Could not open the preview URL in your browser: {error}"));
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
  {
    let _ = normalized;
    return Err("Opening the system browser is not supported on this platform.".to_string());
  }
}

fn normalize_browser_open_url(url: &str) -> Result<String, String> {
  let trimmed = url.trim();
  if trimmed.is_empty() {
    return Err("Preview URL is empty.".to_string());
  }

  if trimmed.chars().any(char::is_whitespace) {
    return Err("Preview URL is invalid.".to_string());
  }

  if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
    return Ok(trimmed.to_string());
  }

  Err("Preview URL must use http:// or https://.".to_string())
}

fn read_json_file(path: &Path) -> Result<Value, String> {
  let raw = fs::read_to_string(path)
    .map_err(|error| format!("Could not read `{}`: {error}", path.display()))?;
  serde_json::from_str(&raw).map_err(|error| format!("Could not parse `{}`: {error}", path.display()))
}

fn manifest_has_dependency(manifest: &Value, dependency: &str) -> bool {
  ["dependencies", "devDependencies", "peerDependencies"]
    .into_iter()
    .any(|section| {
      manifest
        .get(section)
        .and_then(Value::as_object)
        .map(|object| object.contains_key(dependency))
        .unwrap_or(false)
    })
}

fn manifest_has_script(manifest: &Value, script: &str) -> bool {
  manifest
    .get("scripts")
    .and_then(Value::as_object)
    .map(|object| object.contains_key(script))
    .unwrap_or(false)
}

fn workspace_has_expo_config(workspace_path: &Path) -> bool {
  [
    "app.json",
    "app.config.js",
    "app.config.ts",
    "app.config.mjs",
    "app.config.cjs",
  ]
  .iter()
  .any(|name| workspace_path.join(name).exists())
}

fn detect_preview_url(line: &str) -> Option<String> {
  for prefix in ["http://", "https://"] {
    if let Some(index) = line.find(prefix) {
      let tail = &line[index..];
      let raw_url = tail
        .chars()
        .take_while(|character| {
          !character.is_whitespace() && !['"', '\'', ')', ']'].contains(character)
        })
        .collect::<String>();
      let url = raw_url.trim_end_matches(['.', ',', ';', ':', '!', '?']);
      if !url.is_empty() {
        return Some(url.to_string());
      }
    }
  }

  None
}

fn preview_url_ready(url: &str) -> bool {
  let Some((host, port, path)) = parse_http_url(url) else {
    return false;
  };

  let mut addresses = match (host.as_str(), port).to_socket_addrs() {
    Ok(addresses) => addresses,
    Err(_) => return false,
  };

  let Some(socket) = addresses.next() else {
    return false;
  };
  let Ok(mut stream) = TcpStream::connect_timeout(&socket, Duration::from_millis(800)) else {
    return false;
  };

  let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
  let request = format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
  if stream.write_all(request.as_bytes()).is_err() {
    return false;
  }

  let mut buffer = [0_u8; 12];
  if stream.read(&mut buffer).is_err() {
    return false;
  }

  String::from_utf8_lossy(&buffer).starts_with("HTTP/")
}

fn parse_http_url(url: &str) -> Option<(String, u16, String)> {
  let trimmed = url.strip_prefix("http://")?;
  let (authority, path) = match trimmed.split_once('/') {
    Some((authority, path)) => (authority, format!("/{}", path)),
    None => (trimmed, "/".to_string()),
  };
  let (host, port) = match authority.split_once(':') {
    Some((host, port)) => (host.to_string(), port.parse().ok()?),
    None => (authority.to_string(), 80),
  };
  Some((host, port, path))
}

fn elapsed(start: SystemTime) -> Duration {
  start.elapsed().unwrap_or_default()
}

fn current_timestamp_string() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis()
    .to_string()
}

fn capture_workspace_snapshot(workspace_path: &str) -> Result<WorkspaceSnapshot, String> {
  let mut files = HashMap::new();
  let ignored = ignored_workspace_directory_names();
  let root = Path::new(workspace_path);
  collect_workspace_snapshot(root, root, &ignored, &mut files)?;
  Ok(WorkspaceSnapshot { files })
}

fn collect_workspace_snapshot(
  root: &Path,
  current: &Path,
  ignored: &HashSet<&'static str>,
  files: &mut HashMap<String, WorkspaceFileSnapshot>,
) -> Result<(), String> {
  for entry in fs::read_dir(current)
    .map_err(|error| format!("Could not read `{}`: {error}", current.display()))?
  {
    let entry = entry.map_err(|error| format!("Could not enumerate directory entry: {error}"))?;
    let path = entry.path();
    let metadata = entry
      .metadata()
      .map_err(|error| format!("Could not read metadata for `{}`: {error}", path.display()))?;

    if metadata.is_dir() {
      let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        continue;
      };
      if ignored.contains(name) {
        continue;
      }
      collect_workspace_snapshot(root, &path, ignored, files)?;
      continue;
    }

    if !metadata.is_file() {
      continue;
    }

    let relative = path
      .strip_prefix(root)
      .map_err(|error| format!("Could not relativize `{}`: {error}", path.display()))?
      .to_string_lossy()
      .replace('\\', "/");
    let modified_millis = metadata
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_millis())
      .unwrap_or(0);
    let hash = hash_file(&path)?;

    files.insert(
      relative,
      WorkspaceFileSnapshot {
        size: metadata.len(),
        modified_millis,
        hash,
      },
    );
  }

  Ok(())
}

fn hash_file(path: &Path) -> Result<u64, String> {
  let bytes =
    fs::read(path).map_err(|error| format!("Could not read `{}`: {error}", path.display()))?;
  let mut hasher = DefaultHasher::new();
  bytes.hash(&mut hasher);
  Ok(hasher.finish())
}

fn ignored_workspace_directory_names() -> HashSet<&'static str> {
  [
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "target",
    "coverage",
    ".expo",
    ".turbo",
  ]
  .into_iter()
  .collect()
}

fn diff_workspace_snapshots(
  turn_id: Option<String>,
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
) -> WorkspaceChangeSummaryPayload {
  let mut added = Vec::new();
  let mut modified = Vec::new();
  let mut deleted = Vec::new();

  for (path, after_entry) in &after.files {
    match before.files.get(path) {
      Some(before_entry) if before_entry == after_entry => {}
      Some(_) => modified.push(path.clone()),
      None => added.push(path.clone()),
    }
  }

  for path in before.files.keys() {
    if !after.files.contains_key(path) {
      deleted.push(path.clone());
    }
  }

  added.sort();
  modified.sort();
  deleted.sort();
  let mut changed_files = Vec::new();
  changed_files.extend(added.iter().cloned());
  changed_files.extend(modified.iter().cloned());
  changed_files.extend(deleted.iter().cloned());
  let summary = format!("Changed {} files", changed_files.len());

  WorkspaceChangeSummaryPayload {
    turn_id,
    summary,
    added,
    modified,
    deleted,
    changed_files,
    captured_at: current_timestamp_string(),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .setup(|app| {
      let settings = Arc::new(SettingsStore::load(settings_file_path(app.handle())?)?);
      app.manage(AppState::new(app.handle().clone(), settings));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      bootstrap,
      pick_workspace,
      refresh_codex_status,
      refresh_preview_state,
      update_codex_settings,
      connect_codex,
      disconnect_codex,
      start_preview,
      stop_preview,
      restart_preview,
      open_preview_in_browser,
      send_turn,
      interrupt_turn
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
      apply_codex_runtime_env, build_codex_global_args, detect_preview_url,
      diff_workspace_snapshots, idle_preview_state_for_workspace, infer_preview_url_from_script,
      manifest_has_dependency, manifest_has_script, normalize_browser_open_url,
      normalize_optional_string, parse_command_line, parse_response_id,
      resolve_npm_preview_script, stable_workspace_token, CodexRuntimePaths, CodexStatus,
      PersistedSettings, SessionRuntimeState, WorkspaceFileSnapshot, WorkspaceSnapshot,
    };
  use crate::prompt_profile::{build_turn_input, prompt_profile, SessionPromptContext};
  use serde_json::json;
  use std::{collections::HashMap, process::Command};

  #[test]
  fn trims_optional_strings() {
    assert_eq!(
      normalize_optional_string(Some("  codex  ".to_string())),
      Some("codex".to_string())
    );
    assert_eq!(normalize_optional_string(Some("   ".to_string())), None);
    assert_eq!(normalize_optional_string(None), None);
  }

  #[test]
  fn parses_numeric_or_string_response_ids() {
    assert_eq!(parse_response_id(&json!({ "id": 7 })), Some(7));
    assert_eq!(parse_response_id(&json!({ "id": "8" })), Some(8));
    assert_eq!(parse_response_id(&json!({ "id": "abc" })), None);
  }

  #[test]
  fn session_runtime_state_converts_to_payload() {
    let mut runtime = SessionRuntimeState {
      workspace_path: "C:/repo".to_string(),
      codex_workspace_path: "C:/repo".to_string(),
      status: "running".to_string(),
      provider_thread_id: Some("thread-1".to_string()),
      active_turn_id: Some("turn-1".to_string()),
      last_error: None,
      project_brief: None,
      active_model: Some("gpt-5.4".to_string()),
    };

    let first_turn_brief = runtime.project_brief_for_turn("Build a fitness coaching app.");
    runtime.remember_project_brief("Build a fitness coaching app.");
    let second_turn_brief = runtime.project_brief_for_turn("Add subscription management.");
    let payload = runtime.to_payload();

    assert!(payload.connected);
    assert_eq!(payload.status, "running");
    assert_eq!(payload.provider_thread_id.as_deref(), Some("thread-1"));
    assert_eq!(payload.active_turn_id.as_deref(), Some("turn-1"));
    assert_eq!(payload.active_model.as_deref(), Some("gpt-5.4"));
    assert_eq!(first_turn_brief, "Build a fitness coaching app.");
    assert_eq!(second_turn_brief, "Build a fitness coaching app.");
  }

  #[test]
  fn persisted_settings_default_to_empty_state() {
    let settings = PersistedSettings::default();
    assert_eq!(
      settings,
      PersistedSettings {
        workspace_path: None,
        codex_binary_path: None,
        codex_home_path: None,
        default_model: None,
        preview_command: None,
      }
    );
  }

  #[test]
  fn codex_status_shape_matches_frontend_contract() {
    let status = CodexStatus {
      status: "ready".to_string(),
      version: Some("codex-cli 0.121.0".to_string()),
      message: "Codex CLI is installed and authenticated.".to_string(),
      binary_path: "codex".to_string(),
      home_path: None,
    };
    assert_eq!(status.status, "ready");
    assert_eq!(status.binary_path, "codex");
  }

  #[test]
  fn turn_input_uses_hidden_profile_blocks() {
    let input = build_turn_input(
      prompt_profile(),
      &SessionPromptContext {
        project_brief: "Build a restaurant app.".to_string(),
      },
      "Add a reservations flow.",
    );

    assert_eq!(input.len(), 3);
    assert!(input[0]["text"].as_str().unwrap_or_default().contains("DRAFFITI_SYSTEM_PROFILE"));
    assert!(input[1]["text"].as_str().unwrap_or_default().contains("Pinned project brief"));
    assert_eq!(
      input[2]["text"].as_str(),
      Some("DRAFFITI_USER_REQUEST\nAdd a reservations flow.")
    );
  }

  #[test]
  fn codex_runtime_env_points_npm_to_workspace_cache() {
    let runtime_paths = CodexRuntimePaths {
      cache_root: "C:/cache".to_string(),
      temp_root: "C:/temp".to_string(),
    };
    let mut command = Command::new("cmd");
    apply_codex_runtime_env(&mut command, &runtime_paths);
    let envs = command.get_envs().collect::<Vec<_>>();

    assert!(
      envs
        .iter()
        .any(|(key, value)| key.to_string_lossy() == "NPM_CONFIG_CACHE" && value.is_some())
    );
    assert!(
      envs
        .iter()
        .any(|(key, value)| key.to_string_lossy() == "TMP" && value.is_some())
    );
  }

  #[test]
  fn stable_workspace_token_is_deterministic() {
    let first = stable_workspace_token("C:/repo");
    let second = stable_workspace_token("C:/repo");
    assert_eq!(first, second);
  }

  #[test]
  fn build_codex_global_args_includes_model_when_requested() {
    assert_eq!(
      build_codex_global_args(Some("gpt-5.4")),
      vec!["-m".to_string(), "gpt-5.4".to_string()]
    );
    assert!(build_codex_global_args(None).is_empty());
  }

  #[test]
  fn preview_command_line_parser_supports_quotes() {
    let parsed = parse_command_line(r#"npm run dev -- --host "127.0.0.1" --port 4173"#)
      .expect("command should parse");
    assert_eq!(parsed[0], "npm");
    assert_eq!(parsed[5], "127.0.0.1");
  }

  #[test]
  fn infers_preview_url_from_script_flags_without_rewriting_the_command() {
    assert_eq!(
      infer_preview_url_from_script("vite --host localhost --port 1420 --strictPort"),
      Some("http://localhost:1420".to_string())
    );
    assert_eq!(
      infer_preview_url_from_script("vite --host 0.0.0.0 --port 3000"),
      Some("http://127.0.0.1:3000".to_string())
    );
  }

  #[test]
  fn infers_preview_url_from_common_dev_server_defaults() {
    assert_eq!(
      infer_preview_url_from_script("vite"),
      Some("http://127.0.0.1:5173".to_string())
    );
    assert_eq!(
      infer_preview_url_from_script("vite preview"),
      Some("http://127.0.0.1:4173".to_string())
    );
    assert_eq!(
      infer_preview_url_from_script("next dev --hostname=0.0.0.0"),
      Some("http://127.0.0.1:3000".to_string())
    );
    assert_eq!(
      infer_preview_url_from_script("react-scripts start"),
      Some("http://127.0.0.1:3000".to_string())
    );
  }

  #[test]
  fn preview_url_detection_trims_sentence_punctuation() {
    assert_eq!(
      detect_preview_url("Reusing existing desktop dev server at http://127.0.0.1:1420."),
      Some("http://127.0.0.1:1420".to_string())
    );
  }

  #[test]
  fn resolves_preview_script_fallbacks_in_priority_order() {
    let manifest = json!({
      "scripts": {
        "preview": "vite preview",
        "start": "node server.js"
      }
    });
    let (candidate, script_body) =
      resolve_npm_preview_script(&manifest).expect("preview script should resolve");
    assert_eq!(candidate.script_name, "preview");
    assert_eq!(candidate.source, "npmScript");
    assert_eq!(script_body, "vite preview");

    let manifest = json!({
      "scripts": {
        "dev": "vite",
        "preview": "vite preview"
      }
    });
    let (candidate, _) =
      resolve_npm_preview_script(&manifest).expect("dev script should resolve");
    assert_eq!(candidate.script_name, "dev");
    assert_eq!(candidate.source, "npmDev");
  }

  #[test]
  fn browser_open_url_validation_rejects_invalid_values() {
    assert_eq!(
      normalize_browser_open_url("http://127.0.0.1:4173"),
      Ok("http://127.0.0.1:4173".to_string())
    );
    assert!(normalize_browser_open_url("localhost:4173").is_err());
    assert!(normalize_browser_open_url("http://127.0.0.1:4173 path").is_err());
  }

  #[test]
  fn manifest_helpers_detect_dependencies_and_scripts() {
    let manifest = json!({
      "dependencies": { "expo": "^52.0.0" },
      "scripts": { "dev": "vite" }
    });

    assert!(manifest_has_dependency(&manifest, "expo"));
    assert!(manifest_has_script(&manifest, "dev"));
  }

  #[test]
  fn idle_preview_state_reports_missing_command() {
    let preview = idle_preview_state_for_workspace(Some("C:/repo".to_string()), None);
    assert_eq!(preview.status, "idle");
  }

  #[test]
  fn workspace_snapshot_diff_classifies_added_modified_and_deleted() {
    let before = WorkspaceSnapshot {
      files: HashMap::from([
        (
          "src/App.tsx".to_string(),
          WorkspaceFileSnapshot {
            size: 10,
            modified_millis: 1,
            hash: 11,
          },
        ),
        (
          "src/old.ts".to_string(),
          WorkspaceFileSnapshot {
            size: 5,
            modified_millis: 1,
            hash: 22,
          },
        ),
      ]),
    };
    let after = WorkspaceSnapshot {
      files: HashMap::from([
        (
          "src/App.tsx".to_string(),
          WorkspaceFileSnapshot {
            size: 15,
            modified_millis: 2,
            hash: 33,
          },
        ),
        (
          "src/new.ts".to_string(),
          WorkspaceFileSnapshot {
            size: 3,
            modified_millis: 2,
            hash: 44,
          },
        ),
      ]),
    };

    let diff = diff_workspace_snapshots(Some("turn-1".to_string()), before, after);

    assert_eq!(diff.summary, "Changed 3 files");
    assert_eq!(diff.added, vec!["src/new.ts".to_string()]);
    assert_eq!(diff.modified, vec!["src/App.tsx".to_string()]);
    assert_eq!(diff.deleted, vec!["src/old.ts".to_string()]);
  }
}
