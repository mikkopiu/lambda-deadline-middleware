<!-- SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors -->
<!-- SPDX-License-Identifier: MIT -->

# Architecture

Design decisions for `lambda-deadline-middleware`. Implementation-level rationale lives as comments next to the relevant
code; this document covers cross-cutting decisions and the big picture.

## Data Flow

```mermaid
sequenceDiagram
    participant H as Handler
    participant CS as Context Store
    participant MW as Deadline Middleware
    participant SDK as HTTP Handler

    H->>CS: run(context, handler)
    H->>SDK: client.send(command)
    SDK->>MW: attempt dispatch
    MW->>CS: getRemainingTimeInMillis()
    CS-->>MW: 4500ms
    MW->>MW: 4500 - 1000 = 3500ms deadline
    MW->>SDK: next(args) with AbortSignal
    SDK-->>MW: response
    MW->>MW: clearTimeout (using disposal)
    MW-->>H: result
```

## Design Decisions

### ESM-only

Node.js 24 has complete ESM support with working tree-shaking. Dual-package publishing introduces the dual-package
hazard (two copies of module state in one process), separate tsconfig, and ongoing maintenance. Not worth it for a
library targeting Node.js 24+.

## Conventions

### Errors

| Scenario            | Behavior                         |
| ------------------- | -------------------------------- |
| User handler throws | Propagated without wrapping      |
| Deadline exceeded   | `DeadlineExceededError`          |
| Invalid config      | `TypeError` at registration      |
| Outside Lambda      | No-op (never throws, never logs) |

### Code style

- Pure functions over classes
- `readonly` everywhere
- Discriminated unions for multi-outcome results
- No runtime `as` casts (only in branded constructors)
- "Why" comments only

## Performance

- Middleware overhead: < 50µs median
- Memory per request: one `AbortController` + one `setTimeout`
- No I/O in the middleware path
- Deterministic cleanup via `using`
