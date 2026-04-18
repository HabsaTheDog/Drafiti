use std::{
  collections::HashMap,
  env,
  fs,
  io::{BufRead, BufReader, Write},
  path::{Path, PathBuf},
  process::{Child, ChildStdin, Command, Stdio},
  sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
  },
  thread,
  time::Duration,
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

const CODEX_EVENT_NAME: &str = "codex-event";
const SETTINGS_FILE_NAME: &str = "settings.json";
const REQUEST_TIMEOUT_SECONDS: u64 = 20;
const SESSION_SERVICE_NAME: &str = "draffiti_desktop";

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PersistedSettings {
  workspace_path: Option<String>,
  codex_binary_path: Option<String>,
  codex_home_path: Option<String>,
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
struct SessionStatePayload {
  connected: bool,
  status: String,
  workspace_path: Option<String>,
  provider_thread_id: Option<String>,
  active_turn_id: Option<String>,
  last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
  workspace_path: Option<String>,
  codex_binary_path: Option<String>,
  codex_home_path: Option<String>,
  codex_status: CodexStatus,
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
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectCodexInput {
  workspace_path: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendTurnInput {
  text: String,
}

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

#[derive(Clone, Debug)]
struct SessionRuntimeState {
  workspace_path: String,
  codex_workspace_path: String,
  status: String,
  provider_thread_id: Option<String>,
  active_turn_id: Option<String>,
  last_error: Option<String>,
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
    }
  }
}

struct CodexSession {
  app_handle: AppHandle,
  child: Mutex<Child>,
  stdin: Mutex<ChildStdin>,
  pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
  next_request_id: AtomicU64,
  stopping: AtomicBool,
  runtime: Mutex<SessionRuntimeState>,
}

impl CodexSession {
  async fn start(
    app_handle: AppHandle,
    settings: &PersistedSettings,
    workspace_path: String,
    codex_workspace_path: String,
  ) -> Result<Arc<Self>, String> {
    let (mut command, binary_path) = build_codex_command(settings, &["app-server"]);
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
      }),
    });

    session.emit(
      "session/connecting",
      Some("Starting Codex app-server.".to_string()),
      None,
      None,
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
          "sandbox": "workspace-write",
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
    );

    Ok(session)
  }

  fn snapshot(&self) -> SessionStatePayload {
    self.runtime.lock().expect("runtime lock poisoned").to_payload()
  }

  async fn send_turn(&self, text: String) -> Result<TurnAck, String> {
    let runtime = self.runtime.lock().expect("runtime lock poisoned").clone();
    let provider_thread_id = runtime
      .provider_thread_id
      .ok_or_else(|| "Codex session is missing a provider thread id.".to_string())?;

    let response = self
      .send_request(
        "turn/start",
        json!({
          "threadId": provider_thread_id,
          "cwd": runtime.codex_workspace_path,
          "approvalPolicy": "never",
          "sandboxPolicy": {
            "type": "workspaceWrite",
            "writableRoots": [runtime.codex_workspace_path],
            "networkAccess": true,
          },
          "input": [
            {
              "type": "text",
              "text": text,
            }
          ]
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

    self.update_runtime(|state| {
      state.status = "running".to_string();
      state.active_turn_id = Some(turn_id.clone());
      state.last_error = None;
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

  fn spawn_stdout_pump(self: &Arc<Self>, stdout: impl std::io::Read + Send + 'static) {
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
              );
            }
            break;
          }
        }
      }
    });
  }

  fn spawn_stderr_pump(self: &Arc<Self>, stderr: impl std::io::Read + Send + 'static) {
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
        self.emit(method, None, None, None, None, thread_id);
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
        self.emit(method, None, None, Some("running".to_string()), turn_id, None);
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
        self.emit(method, None, delta, None, turn_id, None);
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
        self.emit(method, message, None, Some(status), turn_id, None);
      }
      "error" => {
        let message = params
          .get("error")
          .and_then(|error| error.get("message"))
          .and_then(Value::as_str)
          .map(str::to_owned)
          .or_else(|| params.get("message").and_then(Value::as_str).map(str::to_owned))
          .unwrap_or_else(|| "Codex reported an unknown error.".to_string());
        self.update_runtime(|runtime| {
          runtime.status = "error".to_string();
          runtime.last_error = Some(message.clone());
        });
        self.emit(
          method,
          Some(message),
          None,
          Some("error".to_string()),
          None,
          None,
        );
      }
      _ => {}
    }

    Ok(())
  }

  async fn send_request(
    &self,
    method: &str,
    params: Value,
    wait_for: Duration,
  ) -> Result<Value, String> {
    let request_id = self.next_request_id.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = oneshot::channel();
    self
      .pending
      .lock()
      .expect("pending lock poisoned")
      .insert(request_id, sender);

    if let Err(error) = self.write_message(&json!({
      "id": request_id,
      "method": method,
      "params": params,
    })) {
      self
        .pending
        .lock()
        .expect("pending lock poisoned")
        .remove(&request_id);
      return Err(error);
    }

    match timeout(wait_for, receiver).await {
      Ok(Ok(Ok(value))) => Ok(value),
      Ok(Ok(Err(error))) => Err(error),
      Ok(Err(_)) => Err(format!("Codex request `{method}` was dropped before completion.")),
      Err(_) => {
        self
          .pending
          .lock()
          .expect("pending lock poisoned")
          .remove(&request_id);
        Err(format!("Timed out waiting for Codex request `{method}`."))
      }
    }
  }

  fn send_notification(&self, method: &str, params: Value) -> Result<(), String> {
    self.write_message(&json!({
      "method": method,
      "params": params,
    }))
  }

  fn write_message(&self, value: &Value) -> Result<(), String> {
    let mut stdin = self.stdin.lock().expect("stdin lock poisoned");
    let encoded = serde_json::to_string(value)
      .map_err(|error| format!("Could not encode Codex message: {error}"))?;
    stdin
      .write_all(encoded.as_bytes())
      .map_err(|error| format!("Could not write to Codex stdin: {error}"))?;
    stdin
      .write_all(b"\n")
      .map_err(|error| format!("Could not delimit Codex message: {error}"))?;
    stdin
      .flush()
      .map_err(|error| format!("Could not flush Codex stdin: {error}"))?;
    Ok(())
  }

  fn update_runtime<F>(&self, updater: F)
  where
    F: FnOnce(&mut SessionRuntimeState),
  {
    let mut runtime = self.runtime.lock().expect("runtime lock poisoned");
    updater(&mut runtime);
  }

  fn emit(
    &self,
    method: &str,
    message: Option<String>,
    delta: Option<String>,
    status: Option<String>,
    turn_id: Option<String>,
    thread_id: Option<String>,
  ) {
    let resolved_thread_id = thread_id.or_else(|| {
      self
        .runtime
        .lock()
        .expect("runtime lock poisoned")
        .provider_thread_id
        .clone()
    });
    let payload = CodexEventEnvelope {
      id: Uuid::new_v4().to_string(),
      method: method.to_string(),
      message,
      delta,
      status,
      turn_id,
      thread_id: resolved_thread_id,
    };

    let _ = self.app_handle.emit(CODEX_EVENT_NAME, payload);
  }
}

struct AppState {
  settings: Arc<SettingsStore>,
  session: Mutex<Option<Arc<CodexSession>>>,
  app_handle: AppHandle,
}

impl AppState {
  fn new(app_handle: AppHandle, settings: Arc<SettingsStore>) -> Self {
    Self {
      settings,
      session: Mutex::new(None),
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

  async fn connect(&self, workspace_path: String) -> Result<SessionStatePayload, String> {
    let normalized = normalize_optional_string(Some(workspace_path.clone()))
      .ok_or_else(|| "Workspace path is required.".to_string())?;
    let path = Path::new(&normalized);
    if !path.is_dir() {
      return Err("Workspace path must point to an existing folder.".to_string());
    }
    let codex_workspace_path = resolve_codex_workspace_path(path)?;

    let _ = self.disconnect_active_session().await?;
    self.settings.update(|settings| settings.workspace_path = Some(normalized.clone()))?;
    let settings = self.settings.snapshot();
    let codex_status = probe_codex_status(&settings)?;
    if codex_status.status != "ready" {
      return Err(codex_status.message);
    }

    let session = CodexSession::start(
      self.app_handle.clone(),
      &settings,
      normalized,
      codex_workspace_path,
    )
    .await?;
    let snapshot = session.snapshot();
    *self.session.lock().expect("session lock poisoned") = Some(session);
    Ok(snapshot)
  }
}

#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<BootstrapState, String> {
  let settings = state.settings.snapshot();
  Ok(BootstrapState {
    workspace_path: settings.workspace_path.clone(),
    codex_binary_path: settings.codex_binary_path.clone(),
    codex_home_path: settings.codex_home_path.clone(),
    codex_status: probe_codex_status(&settings)?,
    session: state.session_snapshot(),
  })
}

#[tauri::command]
fn pick_workspace(state: State<'_, AppState>) -> Result<WorkspaceSelection, String> {
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
async fn update_codex_settings(
  state: State<'_, AppState>,
  input: CodexSettingsInput,
) -> Result<BootstrapState, String> {
  let settings = state.settings.update(|settings| {
    settings.codex_binary_path = normalize_optional_string(input.codex_binary_path.clone());
    settings.codex_home_path = normalize_optional_string(input.codex_home_path.clone());
  })?;

  Ok(BootstrapState {
    workspace_path: settings.workspace_path.clone(),
    codex_binary_path: settings.codex_binary_path.clone(),
    codex_home_path: settings.codex_home_path.clone(),
    codex_status: probe_codex_status(&settings)?,
    session: state.session_snapshot(),
  })
}

#[tauri::command]
async fn connect_codex(
  state: State<'_, AppState>,
  input: ConnectCodexInput,
) -> Result<SessionStatePayload, String> {
  state.connect(input.workspace_path).await
}

#[tauri::command]
async fn disconnect_codex(state: State<'_, AppState>) -> Result<SessionStatePayload, String> {
  state.disconnect_active_session().await
}

#[tauri::command]
async fn send_turn(
  state: State<'_, AppState>,
  input: SendTurnInput,
) -> Result<TurnAck, String> {
  let session = state
    .current_session()
    .ok_or_else(|| "Connect to Codex before sending a prompt.".to_string())?;
  let text = normalize_optional_string(Some(input.text))
    .ok_or_else(|| "Prompt text cannot be empty.".to_string())?;
  session.send_turn(text).await
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
  }
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
  fn apply_args(&self, command: &mut Command, args: &[&str]) {
    command.args(&self.launcher_args);

    if self.executable.eq_ignore_ascii_case("cmd.exe") {
      command.arg(build_cmd_invocation(&self.display_path, args));
      return;
    }

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

fn build_cmd_invocation(program: &str, args: &[&str]) -> String {
  let mut parts = Vec::with_capacity(args.len() + 1);
  parts.push(quote_cmd_token(program));
  for arg in args {
    parts.push(quote_cmd_token(arg));
  }
  format!("\"{}\"", parts.join(" "))
}

fn quote_cmd_token(token: &str) -> String {
  if token.contains([' ', '\t', '"']) {
    format!("\"{}\"", token.replace('"', "\"\""))
  } else {
    token.to_string()
  }
}

fn build_codex_command(settings: &PersistedSettings, args: &[&str]) -> (Command, String) {
  let resolved = resolve_codex_command(settings);
  let mut command = Command::new(&resolved.executable);
  resolved.apply_args(&mut command, args);
  if let Some(home_path) = settings.codex_home_path.as_deref() {
    command.env("CODEX_HOME", home_path);
  }
  (command, resolved.display_path)
}

fn spawn_codex_command(
  settings: &PersistedSettings,
  args: &[&str],
) -> Result<std::process::Output, String> {
  let (mut command, binary_path) = build_codex_command(settings, args);
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
    message: format!(
      "Codex CLI is installed but the auth probe failed. {login_text}"
    ),
    binary_path,
    home_path: settings.codex_home_path.clone(),
  })
}

fn combined_output(output: &std::process::Output) -> String {
  let stdout = String::from_utf8_lossy(&output.stdout);
  let stderr = String::from_utf8_lossy(&output.stderr);
  format!("{stdout}\n{stderr}")
    .trim()
    .to_string()
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
      .map_err(|error| format!("Could not stop Codex process tree: {error}"))?;
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
      .map_err(|error| format!("Could not stop Codex process: {error}"))?;
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
      update_codex_settings,
      connect_codex,
      disconnect_codex,
      send_turn,
      interrupt_turn
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::{normalize_optional_string, parse_response_id, CodexStatus, PersistedSettings, SessionRuntimeState};
  use serde_json::json;

  #[test]
  fn trims_optional_strings() {
    assert_eq!(normalize_optional_string(Some("  codex  ".to_string())), Some("codex".to_string()));
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
    let runtime = SessionRuntimeState {
      workspace_path: "C:/repo".to_string(),
      codex_workspace_path: "C:/repo".to_string(),
      status: "running".to_string(),
      provider_thread_id: Some("thread-1".to_string()),
      active_turn_id: Some("turn-1".to_string()),
      last_error: None,
    };

    let payload = runtime.to_payload();
    assert!(payload.connected);
    assert_eq!(payload.status, "running");
    assert_eq!(payload.provider_thread_id.as_deref(), Some("thread-1"));
    assert_eq!(payload.active_turn_id.as_deref(), Some("turn-1"));
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
}
