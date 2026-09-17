# `@codehud/codex-protocol`

The Codex app-server protocol, as the `codex` binary itself describes it.

## Why it exists

Codex generates its own TypeScript definitions from the Rust the server is written in:

```bash
pnpm run codex:bindings
# codex app-server generate-ts --out packages/codex-protocol/src
```

Hand-writing a JSON-RPC client from documentation drifts silently on the next release. Generating it turns that drift into a compile error, at the moment someone regenerates.

Nothing here is written by hand, and every file says so in its own banner.

## What it came from

| | |
| --- | --- |
| Generated from | `codex-cli 0.154.0` |
| Generated on | 2026-09-18 |
| Files | 711 TypeScript declarations, 413 KB |

The version is recorded in `package.json` under `codex`, because it pins what the adapter was written against. Regenerating without recording the new version leaves the repository unable to say what it is speaking to.

## Committed rather than generated during the build

Three arrangements were considered. This one keeps the build hermetic: the repository compiles with no `codex` installed, continuous integration needs no vendor binary, and a version bump is a diff a reviewer can read.

The cost is that the committed copy can go stale without anyone noticing. That is the same discipline the captured Claude Code fixtures run on: a vendor bump is a deliberate act, and the regeneration happens then, under a person who is looking. Generating during the build would trade a hermetic build for automation of something that happens a few times a year.

## Types only

Every declaration here is a type. Nothing in 711 files produces a single runtime statement, which was checked rather than assumed: compiled normally, the package emitted 711 JavaScript modules of 161 bytes each, 2.9 MB of nothing. It is built with `emitDeclarationOnly`, which halves what lands in `lib` and emits no JavaScript at all.

## Not held to this repository's rules

Two carve-outs, both deliberate:

- **The lint config extends nothing.** The evidence rules ask each export to document what requirement it realizes, which generated code cannot answer: these types describe what a vendor's binary speaks, not anything this repository promised. Inheriting the root ruleset would also let a vendor's next release fail this build for style, with the only available fix being to edit a file that says not to.
- **Formatting skips this directory.** Prettier reformats 574 of these files; the next regeneration would rewrite them back, turning every vendor bump into a diff nobody can read.

The evidence graph needed no carve-out, which was checked by deleting one and watching for a new diagnostic that never came. A host that cites nothing is not an error there; only a citation pointing nowhere is.

## Contract traceability

None, by design. The adapter that consumes these types carries the citations, because it is the part that realizes something this repository promised.
