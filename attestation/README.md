<!-- SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Supply Chain Attestation

This directory documents the supply chain attestation strategy for `lambda-deadline-middleware`.

## What's provided

Every published release includes:

- **SLSA Level 3 provenance** via npm trusted publishing (OIDC). Generated automatically by GitHub Actions during
  publish. No long-lived tokens involved.
- **CycloneDX SBOM** (`sbom.cdx.json`) attached to each GitHub Release.

## Verification

```bash
# Verify SLSA provenance and sigstore signatures
npm audit signatures
```

This confirms the package was built from this repository by the expected GitHub Actions workflow and signed via sigstore.
