#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Runs actionlint via podman with a digest-pinned image.
# Usage: scripts/actionlint.sh

set -euo pipefail

# renovate: datasource=docker depName=docker.io/rhysd/actionlint
IMAGE="docker.io/rhysd/actionlint:1.7.12@sha256:9d36088643581e728c969f35141f88139fec77280b2be23c1f66f8e40e1025e7"

exec podman run --rm -w /repo -v "$(pwd):/repo:Z" "${IMAGE}" "$@"
