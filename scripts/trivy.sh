#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Runs Trivy SCA scanner via podman with a digest-pinned image.
# Usage: scripts/trivy.sh [full]
#   no args  → vuln scan, exit-code 1 on HIGH/CRITICAL
#   full     → vuln + secret + misconfig scan (informational)

set -euo pipefail

# renovate: datasource=docker depName=ghcr.io/aquasecurity/trivy
IMAGE="ghcr.io/aquasecurity/trivy:0.71.0@sha256:016eae51fdcf989332a5404af7e8f625cd5d95d7c0907a221d080a996f556500"

if [[ "${1:-}" == "full" ]]; then
  exec podman run --rm \
    -v "$(pwd):/src:Z" \
    -v trivy-cache:/root/.cache/trivy:Z \
    "${IMAGE}" \
    fs --config /src/.config/trivy.yaml \
    --ignorefile /src/.config/.trivyignore \
    --scanners vuln,secret,misconfig \
    --include-dev-deps /src
else
  exec podman run --rm \
    -v "$(pwd):/src:Z" \
    -v trivy-cache:/root/.cache/trivy:Z \
    "${IMAGE}" \
    fs --config /src/.config/trivy.yaml \
    --ignorefile /src/.config/.trivyignore \
    --scanners vuln \
    --include-dev-deps \
    --exit-code 1 \
    --severity HIGH,CRITICAL /src
fi
