<!-- SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Contributing

Contributions are welcome. This document covers the development workflow, tooling, and conventions.

## Prerequisites

- **Node.js 24+**: install via [fnm](https://github.com/Schniz/fnm): `fnm use` (reads `.node-version`)
- **pnpm**: install via `corepack enable` (ships with Node.js)
- **Git**: with hooks support (lefthook manages pre-commit)

## Setup

```bash
git clone <repo-url>
cd lambda-deadline-middleware
pnpm install
```

This installs dependencies and sets up git hooks via lefthook.

## Development Workflow

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Benchmarks
pnpm bench

# Type checking
pnpm typecheck
```

### Linting

```bash
# oxlint (fast, Rust-based linter)
pnpm lint

# Unused exports/dependencies detection
pnpm lint:knip
```

### Building

```bash
pnpm build
```

Produces declaration files (`.d.ts`) and JavaScript output in `dist/`.

### SBOM Generation

```bash
pnpm sbom
```

Produces `sbom.cdx.json` using CycloneDX.

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commits are validated by commitlint
via a pre-commit hook.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Purpose                                    |
| ---------- | ------------------------------------------ |
| `feat`     | New feature (triggers minor version bump)  |
| `fix`      | Bug fix (triggers patch version bump)      |
| `docs`     | Documentation changes                      |
| `refactor` | Code restructuring without behavior change |
| `test`     | Adding or modifying tests                  |
| `perf`     | Performance improvements                   |
| `ci`       | CI/CD configuration changes                |
| `chore`    | Maintenance tasks (deps, tooling)          |

### Breaking Changes

Append `!` after type/scope or include `BREAKING CHANGE:` in the footer:

```
feat!: rename withDeadline to withRequestDeadline

BREAKING CHANGE: withDeadline is now withRequestDeadline for clarity.
```

## Pull Request Workflow

1. Create a feature branch from `main`
2. Make your changes with appropriate tests
3. Ensure all checks pass locally: `pnpm typecheck && pnpm lint && pnpm test`
4. Push and open a PR against `main`
5. CI runs lint, type check, tests, benchmarks, and secret scanning
6. At least one approval required before merge

### PR Checklist

- [ ] Tests added/updated for new behavior
- [ ] Property tests cover invariants where applicable
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] No unused exports (`pnpm lint:knip`)
- [ ] Commit messages follow Conventional Commits

## Code Style

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and conventions.

Key points:

- Pure functions over classes
- `readonly` everywhere
- "Why" comments only

## Testing Policy

All major changes to the library must include corresponding test updates. A "major change" is any modification that
alters observable behavior, adds a new code path, or fixes a bug.

### Requirements

- **New features**: Must include unit tests and, where applicable, property-based tests covering invariants.
- **Bug fixes**: Must include a regression test that fails without the fix.
- **Refactors**: Must not reduce coverage. If existing tests pass, no new tests are required.
- **Performance changes**: Must include benchmark results demonstrating the improvement.

### What runs in CI

The CI pipeline (GitHub Actions) runs the following checks on every PR against `main`:

| Check                    | Tool       | Blocking | Reporting                       |
| ------------------------ | ---------- | -------- | ------------------------------- |
| Lint + format            | oxlint, oxfmt, knip | Yes | Console output              |
| Type check               | tsc        | Yes      | Console output                  |
| Unit + integration tests | vitest     | Yes      | GHA annotations, JUnit artifact |
| Property-based tests     | vitest     | Yes      | GHA annotations                 |
| Benchmarks               | vitest bench | Yes    | Console output                  |
| SAST                     | opengrep   | Yes      | SARIF → Code Scanning           |
| SCA                      | trivy      | Yes      | SARIF → Code Scanning           |
| CI/CD lint               | actionlint | Yes      | Console output                  |
| Secret scanning          | gitleaks   | Yes      | Console output                  |

All checks must pass before a PR can be merged.

### Running tests locally

```bash
# Full test suite (same as CI)
pnpm test

# Watch mode for development
pnpm test:watch

# Benchmarks
pnpm bench

# Mutation testing
pnpm mutation
```

### Test organization

Tests live in `tests/` organized by type: `unit/`, `property/`, `integration/`, `bench/`.

- **Property-based tests** (fast-check) validate universal invariants across all inputs
- **Unit tests** validate specific examples and edge cases
- **Integration tests** verify the full middleware lifecycle with mocked SDK clients
- **Benchmarks** prevent performance regressions

## Dependency Management

### Selection criteria

Dependencies are added only when they provide substantial value over a hand-rolled solution. For this library
specifically, we maintain zero runtime dependencies. `@smithy/types` is compile-time only.

Dev dependencies should be:

- Actively maintained (releases within the last 6 months)
- From well-known publishers with established track records
- Pinned to exact versions in the lockfile (`pnpm-lock.yaml`)

### How dependencies are obtained

All dependencies are installed from the npm registry via pnpm with a frozen lockfile (`pnpm install --frozen-lockfile`)
in CI. The `packageManager` field in `package.json` pins the exact pnpm version with a SHA-512 integrity hash.

### Tracking and updates

[Renovate](https://docs.renovatebot.com/) opens automated PRs weekly for dependency updates. Configuration is in
`.github/renovate.json5`. Key policies:

- **Minimum release age**: 1 day (avoids publishing accidents)
- **GitHub Actions**: Pinned by digest, updated automatically
- **Grouping**: All non-major updates are grouped into a single PR

All dependency update PRs must pass the full CI pipeline before merge.

## Releasing

Releases are **manual**. Merging to `main` does not publish a new version automatically.

When you're ready to release:

1. Go to **Actions → Release → Run workflow** (select `main` branch)
2. Optionally enable "Run without publishing" for a dry run
3. The workflow runs the full build/test pipeline, then [semantic-release](https://github.com/semantic-release/semantic-release) determines the version bump from all commits since the last release tag

semantic-release uses Conventional Commits to decide what to publish:

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
