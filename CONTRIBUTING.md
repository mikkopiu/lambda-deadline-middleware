<!-- SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Contributing

Contributions are welcome. This document covers the development workflow, tooling, and conventions.

## Prerequisites

- **Node.js 24+**: install via e.g. [fnm](https://github.com/Schniz/fnm): `fnm use` (reads `.node-version`)
- **pnpm**: install via `corepack enable`, or follow [official docs](https://pnpm.io/installation)
- **Git**: with hooks support (`lefthook` manages pre-commit)

## Setup

```sh
git clone <repo-url>
cd lambda-deadline-middleware
pnpm install
```

This installs dependencies and sets up git hooks via `lefthook`.

## Development Workflow

### Running Tests

```sh
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Benchmarks
pnpm bench

# Type checking
pnpm typecheck
```

### Formatting and Linting

```sh
# Format (oxfmt)
pnpm fmt

# Lint (oxlint)
pnpm lint

# Unused exports/dependencies detection
pnpm lint:knip
```

### Security Scanning

```sh
# SAST (opengrep)
pnpm sast

# SCA / vulnerability scanning (trivy, requires podman)
pnpm sca

# CI workflow linting (actionlint, requires podman)
pnpm actionlint

# Shell script linting (shellcheck, requires podman)
pnpm shellcheck
```

Gitleaks runs automatically via the lefthook pre-commit hook.

### Building

```sh
pnpm build
```

Produces declaration files (`.d.ts`) and JavaScript output in `dist/`.

### SBOM Generation

```sh
pnpm sbom
```

Produces `sbom.cdx.json` using CycloneDX.

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commits are validated by commitlint
via a pre-commit hook.

Version bumps are determined automatically by semantic-release:

- `feat` → minor
- `fix` / `perf` / `revert` → patch
- `BREAKING CHANGE` footer or `!` suffix → major
- `docs` / `chore` / `ci` / `test` → no release

## Code Style

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and conventions.

Key points:

- Pure functions over classes
- `readonly` everywhere
- "Why" comments only

## Testing Policy

All changes that alter observable behavior, add a code path, or fix a bug must include corresponding tests.

### Test types and when to use them

Tests live in `tests/` organized by type:

- **Unit tests** (`unit/`): Verify specific examples and edge cases. Fast feedback for individual functions. Write these
  for any new or changed behavior.
- **Property-based tests** (`property/`): Use fast-check to validate invariants across randomized inputs. Write these
  when a function has a contract that should hold for _all_ valid inputs (e.g., "deadline is always less than the
  remaining time", "handler return value is never modified").
- **Integration tests** (`integration/`): Exercise the full middleware lifecycle with mocked SDK clients. Write these
  when changes affect how components compose or interact with external interfaces.
- **Benchmarks** (`bench/`): Prevent performance regressions. This middleware sits in the hot path of every SDK call,
  so even small overhead is visible. Include benchmark results when making performance claims.
- **Mutation testing** (Stryker, `pnpm mutate`): Verifies that tests actually detect faults by introducing small changes
  to the source and checking that at least one test fails. Runs incrementally, only mutating code affected by your
  changes. A surviving mutant indicates a gap in test coverage.

### What's expected per change type

- **New features**: Unit tests + property tests covering invariants where applicable.
- **Bug fixes**: A regression test that fails without the fix.
- **Refactors**: Existing tests must still pass. No new tests required if behavior is unchanged.
- **Performance changes**: Benchmark results demonstrating the improvement.

## Dependency Management

This library has zero runtime dependencies. `@smithy/types` is compile-time only.

Dev dependencies should be actively maintained, from well-known publishers, and pinned in the lockfile (including CI,
i.e. no `pnpm exec` to install dynamic dependencies).
[Renovate](https://docs.renovatebot.com/) opens automated PRs for dependency updates weekly (configuration in
`.github/renovate.json5`).

## Releasing

Releases are published exclusively through CI. The decision to release is manual (triggered via
**Actions → Release → Run workflow**), but the actual version bump, build, and publish are handled by
[semantic-release](https://github.com/semantic-release/semantic-release) in the pipeline. Never publish from a local
machine.

semantic-release determines the version from commits since the last tag:

- `feat` → minor bump
- `fix` / `perf` / `revert` → patch bump
- `BREAKING CHANGE` or `!` suffix → major bump
- `docs` / `chore` / `ci` / `test` → no release

If no release-triggering commits exist since the last tag, the workflow exits without publishing.

## External Services

| Service           | Purpose                      | Blocking?             |
| ----------------- | ---------------------------- | --------------------- |
| GitHub Actions CI | Lint, test, type check       | Yes                   |
| Gitleaks          | Secret detection in commits  | Yes (pre-commit + CI) |
| Renovate          | Automated dependency updates | No (opens PRs)        |
| Sigstore          | Keyless artifact signing     | Release only          |

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and supply chain security practices.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

All source files must include REUSE-compliant headers:

```typescript
// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT
```

For files that don't support comments (JSON, etc.), licensing is covered by `REUSE.toml`.
