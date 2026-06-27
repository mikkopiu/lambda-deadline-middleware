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
IMAGE="ghcr.io/aquasecurity/trivy:0.71.2@sha256:f5d0e600ecda7449e2a9b272805aef698631d3bb3f3a739a750de2c6819acdc9"

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
