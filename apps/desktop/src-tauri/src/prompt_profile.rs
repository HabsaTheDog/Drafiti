use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::{json, Value};

const RAW_PROFILE: &str = include_str!("../../prompting/codex-build-profile.v1.json");

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct PromptProfile {
  pub id: String,
  pub label: String,
  pub version: String,
  pub summary: PromptProfileSummary,
  pub rules: PromptRules,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct PromptProfileSummary {
  pub stack: Vec<String>,
  pub design: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct PromptRules {
  pub stack: Vec<String>,
  pub design: Vec<String>,
  pub delivery: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionPromptContext {
  pub project_brief: String,
}

static PROMPT_PROFILE: OnceLock<PromptProfile> = OnceLock::new();

pub fn prompt_profile() -> &'static PromptProfile {
  PROMPT_PROFILE.get_or_init(|| {
    serde_json::from_str::<PromptProfile>(RAW_PROFILE)
      .expect("codex build profile JSON should stay valid")
  })
}

pub fn build_system_prompt(profile: &PromptProfile) -> String {
  let mut lines = vec![
    "DRAFFITI_SYSTEM_PROFILE".to_string(),
    format!("Profile: {} {}", profile.id, profile.version),
    "Follow Draffiti's fixed Codex build policy for this session.".to_string(),
    "Stack requirements:".to_string(),
  ];
  lines.extend(profile.rules.stack.iter().map(|rule| format!("- {rule}")));
  lines.push("Design requirements:".to_string());
  lines.extend(profile.rules.design.iter().map(|rule| format!("- {rule}")));
  lines.push("Delivery requirements:".to_string());
  lines.extend(profile.rules.delivery.iter().map(|rule| format!("- {rule}")));
  lines.join("\n")
}

pub fn build_session_context(
  profile: &PromptProfile,
  context: &SessionPromptContext,
) -> String {
  [
    "DRAFFITI_SESSION_CONTEXT".to_string(),
    format!("Profile: {} {}", profile.id, profile.version),
    format!("Pinned project brief: {}", context.project_brief),
    "Reminder: Use image files from the repo's /img folder for app imagery and pick them by descriptive filenames instead of gradient or placeholder substitutes.".to_string(),
  ]
  .join("\n")
}

pub fn build_user_request(text: &str) -> String {
  format!("DRAFFITI_USER_REQUEST\n{text}")
}

pub fn build_turn_input(
  profile: &PromptProfile,
  context: &SessionPromptContext,
  text: &str,
) -> Vec<Value> {
  vec![
    text_input(build_system_prompt(profile)),
    text_input(build_session_context(profile, context)),
    text_input(build_user_request(text)),
  ]
}

fn text_input(text: String) -> Value {
  json!({
    "type": "text",
    "text": text,
  })
}

#[cfg(test)]
mod tests {
  use super::{
    build_session_context, build_system_prompt, build_turn_input, prompt_profile,
    SessionPromptContext,
  };

  #[test]
  fn prompt_profile_json_parses_successfully() {
    let profile = prompt_profile();
    assert_eq!(profile.id, "draffiti.codex-build-profile");
    assert_eq!(profile.version, "v1");
  }

  #[test]
  fn system_prompt_includes_required_stack_rules() {
    let prompt = build_system_prompt(prompt_profile());
    assert!(prompt.contains("Expo Router"));
    assert!(prompt.contains("NativeWind"));
    assert!(prompt.contains("Convex-friendly"));
    assert!(prompt.contains("phone-sized and desktop-sized screens"));
    assert!(prompt.contains("cross-platform-safe motion patterns"));
  }

  #[test]
  fn system_prompt_includes_required_design_rules() {
    let prompt = build_system_prompt(prompt_profile());
    assert!(prompt.contains("Use image assets from the repo's /img folder"));
    assert!(prompt.contains("Do not add generated images"));
    assert!(prompt.contains("purposeful animations"));
  }

  #[test]
  fn system_prompt_includes_responsive_motion_defaults() {
    let prompt = build_system_prompt(prompt_profile());
    assert!(prompt.contains("subtle default motion"));
    assert!(prompt.contains("Do not over-animate"));
  }

  #[test]
  fn system_prompt_includes_empty_workspace_recovery_rules() {
    let prompt = build_system_prompt(prompt_profile());
    assert!(prompt.contains("rg --files"));
    assert!(prompt.contains("If the selected workspace is empty"));
    assert!(prompt.contains("retry with a concrete fallback"));
  }

  #[test]
  fn session_context_is_short_and_deterministic() {
    let context = build_session_context(
      prompt_profile(),
      &SessionPromptContext {
        project_brief: "Build a fitness coaching app.".to_string(),
      },
    );
    assert!(context.contains("Pinned project brief: Build a fitness coaching app."));
    assert!(context.contains("repo's /img folder"));
  }

  #[test]
  fn turn_input_contains_three_text_items_in_order() {
    let input = build_turn_input(
      prompt_profile(),
      &SessionPromptContext {
        project_brief: "Build a fitness coaching app.".to_string(),
      },
      "Add subscription management.",
    );

    assert_eq!(input.len(), 3);
    assert_eq!(input[0]["type"], "text");
    assert_eq!(input[1]["type"], "text");
    assert_eq!(input[2]["type"], "text");
    assert!(
      input[0]["text"]
        .as_str()
        .expect("system prompt text should be present")
        .starts_with("DRAFFITI_SYSTEM_PROFILE")
    );
    assert!(
      input[1]["text"]
        .as_str()
        .expect("session context text should be present")
        .starts_with("DRAFFITI_SESSION_CONTEXT")
    );
    assert_eq!(
      input[2]["text"].as_str(),
      Some("DRAFFITI_USER_REQUEST\nAdd subscription management.")
    );
  }
}
