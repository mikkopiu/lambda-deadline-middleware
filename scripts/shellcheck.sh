#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Runs shellcheck via podman with a digest-pinned image.
# Usage: scripts/shellcheck.sh [files...]
#   If no files given, finds all .sh files in the repo.

set -euo pipefail

# renovate: datasource=docker depName=docker.io/koalaman/shellcheck
IMAGE="docker.io/koalaman/shellcheck:v0.11.0@sha256:b9389b73c8f26f710a7171cb7d8848a34a9c1e07a7865e727c9ec4ce99f9a83f"

if [[ $# -gt 0 ]]; then
  FILES=("$@")
else
  mapfile -t FILES < <(find . -name '*.sh' -not -path './node_modules/*' -not -path './.git/*')
fi

exec podman run --rm -v "$(pwd):/mnt:Z" -w /mnt "${IMAGE}" "${FILES[@]}"
