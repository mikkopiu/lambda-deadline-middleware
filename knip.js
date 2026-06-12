// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

/** @type {import('knip').KnipConfig} */
export default {
  project: ["src/**/*.ts"],
  ignoreBinaries: ["scripts/ensure-opengrep.sh", "podman"],
  ignoreDependencies: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    "@semantic-release/github",
    "conventional-changelog-conventionalcommits",
  ],
};
