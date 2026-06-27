#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Runs REUSE tool via podman with a digest-pinned image.
# Usage: scripts/reuse.sh [args...]

set -euo pipefail

# renovate: datasource=docker depName=docker.io/fsfe/reuse
IMAGE="docker.io/fsfe/reuse:v6.2.0@sha256:c65a00f628cc5a9bb2dcb2c84f860bd34da567f9b77584eaa6a93d2dfb134a0c"

exec podman run --rm -v "$(pwd):/data:Z" "${IMAGE}" "$@"
