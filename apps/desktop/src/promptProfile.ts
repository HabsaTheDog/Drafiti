import rawProfile from "../prompting/codex-build-profile.v1.json";

import type { PromptProfile } from "./types";

export const codexBuildProfile: PromptProfile = rawProfile;

export const buildProfileHighlights = [
  ...codexBuildProfile.summary.stack,
  ...codexBuildProfile.summary.design,
];
