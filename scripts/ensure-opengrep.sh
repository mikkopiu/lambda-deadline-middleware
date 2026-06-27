#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
# SPDX-License-Identifier: MIT
#
# Ensures opengrep is installed at the expected version.
# Skips install if correct version is already on PATH.
# Downloads from GitHub Releases and verifies with cosign (sigstore) if installing.

set -euo pipefail

EXPECTED_VERSION="1.23.0"
CONFIG_FLAGS=(--config p/typescript --config p/security-audit --config .config/opengrep-rules.yml --taint-intrafile)
INSTALL_DIR="${HOME}/.opengrep/cli/v${EXPECTED_VERSION}"
BINARY="${INSTALL_DIR}/opengrep"

# Extract subcommand (first arg) and remaining args separately.
# Usage: ensure-opengrep.sh <subcommand> [args...]
# Result: opengrep <subcommand> <CONFIG_FLAGS> [args...]
SUBCOMMAND="${1:?Usage: ensure-opengrep.sh <subcommand> [args...]}"
shift
ARGS=("$@")

run_opengrep() {
  exec "$1" "${SUBCOMMAND}" "${CONFIG_FLAGS[@]}" "${ARGS[@]}"
}

# Check if correct version already installed on PATH
if command -v opengrep &>/dev/null; then
  INSTALLED_VERSION=$(opengrep --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  if [[ "${INSTALLED_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    run_opengrep opengrep
  fi
fi

# Check if correct version installed in our managed directory
if [[ -x "${BINARY}" ]]; then
  run_opengrep "${BINARY}"
fi

echo "Installing opengrep v${EXPECTED_VERSION}..." >&2

mkdir -p "${INSTALL_DIR}"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "${TEMP_DIR}"' EXIT

ARCH=$(uname -m)
case "${ARCH}" in
  x86_64) PLATFORM="manylinux_x86" ;;
  aarch64|arm64) PLATFORM="manylinux_aarch64" ;;
  *) echo "ERROR: Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

BASE_URL="https://github.com/opengrep/opengrep/releases/download/v${EXPECTED_VERSION}"

curl -fsSL -o "${TEMP_DIR}/opengrep" "${BASE_URL}/opengrep_${PLATFORM}"
curl -fsSL -o "${TEMP_DIR}/opengrep.sig" "${BASE_URL}/opengrep_${PLATFORM}.sig"
curl -fsSL -o "${TEMP_DIR}/opengrep.cert" "${BASE_URL}/opengrep_${PLATFORM}.cert"

# Verify sigstore signature if cosign is available
if command -v cosign &>/dev/null; then
  cosign verify-blob "${TEMP_DIR}/opengrep" \
    --signature "${TEMP_DIR}/opengrep.sig" \
    --certificate "${TEMP_DIR}/opengrep.cert" \
    --certificate-identity-regexp "https://github.com/opengrep/opengrep/" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" >&2
  echo "Sigstore verification passed." >&2
else
  echo "WARNING: cosign not found, skipping signature verification." >&2
fi

chmod +x "${TEMP_DIR}/opengrep"
mv "${TEMP_DIR}/opengrep" "${BINARY}"

echo "Installed opengrep v${EXPECTED_VERSION} to ${BINARY}" >&2
run_opengrep "${BINARY}"
