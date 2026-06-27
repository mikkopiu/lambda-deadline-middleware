#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Runs gitleaks via podman with a digest-pinned image.
# Usage: scripts/gitleaks.sh [args...]

set -euo pipefail

# renovate: datasource=docker depName=docker.io/zricethezav/gitleaks
IMAGE="docker.io/zricethezav/gitleaks:v8.30.1@sha256:b109bc5f8f76a38196a3e413704fc5b9e3c32360bce4e4b603bd6f45b3721dbb"

exec podman run --rm -v "$(pwd):/repo:Z" -w /repo "${IMAGE}" "$@"
