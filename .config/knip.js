// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

/** @type {import('knip').KnipConfig} */
export default {
  project: ["src/**/*.ts"],
  ignoreBinaries: [
    "scripts/ensure-opengrep.sh",
    "scripts/trivy.sh",
    "scripts/actionlint.sh",
    "scripts/shellcheck.sh",
  ],
  ignoreDependencies: [
    "@commitlint/cli",
    "@commitlint/config-conventional",
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    "@semantic-release/github",
    "conventional-changelog-conventionalcommits",
  ],
};
