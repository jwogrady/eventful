# 0001. Runtime: Bun + TypeScript

- Status: accepted
- Date: 2026-06-22
- Deciders: jwogrady

## Context and problem statement

Eventful needs a runtime for two kinds of code: scheduled ingestion (fetching
and parsing venue sites) and the web view that serves curated gigs. We want one
language across both so the data shapes and helpers are shared, and a runtime
cheap to self-host.

## Decision drivers

- Owner-specified must-use runtime: Bun.
- One language end to end (pipeline + web) to share the event/venue types.
- Fast startup for short-lived scheduled jobs; minimal ops.
- Native TypeScript without a separate build step.

## Considered options

- Bun + TypeScript
- Node.js + TypeScript
- Deno + TypeScript

## Decision

Bun + TypeScript for all code — the ingestion scripts and the Astro server alike.
Start as a single package; split into workspaces only if the pipeline and web
genuinely diverge. Use Bun's built-in test runner and `fetch`.

## Consequences

- Good: one toolchain, native TS, fast cold starts, batteries included (test,
  fetch, sqlite) — a good fit for self-hosted scheduled jobs.
- Bad / cost: smaller ecosystem maturity than Node; some libraries may need
  compatibility shims.
- Risks: DuckDB access from Bun depends on its native bindings/FFI working under
  Bun (see [0003](0003-data-store-duckdb.md)). Validate this early in the
  foundation work; if bindings are unstable, fall back to running the pipeline
  under Node while keeping the web on Bun.
