#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Runs REUSE tool via podman with a digest-pinned image.
# Usage: scripts/reuse.sh [args...]

set -euo pipefail

# renovate: datasource=docker depName=docker.io/fsfe/reuse
IMAGE="docker.io/fsfe/reuse:6.2.0@sha256:85462a75c0f8efda09ddd190b92816b70e7662577c8427429e11e1b9f25a992e"

exec podman run --rm -v "$(pwd):/data:Z" "${IMAGE}" "$@"
