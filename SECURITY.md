<!-- SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Security

Supply chain security practices for `lambda-deadline-middleware`.

## Publishing and Provenance

Releases are published via npm trusted publishing (OIDC). No long-lived npm tokens are stored as secrets. The release
workflow authenticates to npm using a short-lived OIDC token issued by GitHub Actions, and every published package
includes an SLSA Level 3 provenance attestation signed via sigstore.

### How the release pipeline works

1. The release workflow requests an OIDC token from GitHub (`id-token: write` permission).
2. semantic-release exchanges the token with npm for a short-lived publish credential.
3. The package is published with provenance (`publishConfig.provenance: true`).
4. Fulcio issues a signing certificate tied to the workflow identity.
5. The signature is recorded in the Rekor transparency log.
6. npm stores the provenance bundle alongside the package tarball.

Only the release workflow in this repository can publish. There are no local publish credentials.

### Verifying provenance

```sh
npm audit signatures
```

This checks that:

- The certificate was issued by Fulcio
- The OIDC identity matches this repository and workflow
- The signature is recorded in Rekor
- The package content matches the signed digest

You can also inspect the provenance bundle directly:

```sh
npm provenance --package-name lambda-deadline-middleware
```

## SBOM (Software Bill of Materials)

Each release includes a CycloneDX SBOM (`sbom.cdx.json`) attached as a GitHub Release asset, listing all direct and
transitive dependencies with their versions.

To generate locally:

```sh
pnpm run sbom
```

- **Specification**: CycloneDX v1.5
- **Format**: JSON
- **Tool**: `pnpm sbom` (native, since pnpm 11)

## Reporting Vulnerabilities

If you discover a security vulnerability, report it by opening a
[GitHub Security Advisory](https://github.com/mikkopiu/lambda-deadline-middleware/security/advisories/new) on this
repository. Do not file a public issue for security vulnerabilities.

Reports are handled on a best-effort basis. Resolved vulnerabilities are disclosed via GitHub Security Advisories once a
fix is released.
