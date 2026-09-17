---
name: documentation
description: Defines the .wiki/ working knowledge base, package READMEs, source JSDoc, agent-instruction conventions, and the repository writing voice for CodeHUD. Use before writing or modifying any document, AGENTS.md, or a SKILL.md, and revise the wiki as the work proceeds rather than at the end.
---

# Documentation

## Everything committed is English

Source, comments, requirements, specifications, package READMEs, agent instructions, commit messages, and pull-request bodies are English, whichever language the conversation uses.

The one exception is `.wiki/`, which is ignored, local to a checkout, and written in Korean because it is the user's working knowledge base rather than a shipped artifact.

## The `.wiki/` knowledge base

`.wiki/` is the durable cross-session knowledge base. It starts empty in a fresh checkout. Read whatever it holds at session start, create what it does not hold yet, and revise as the work proceeds.

Layout, created on demand:

| Directory | Holds |
| --- | --- |
| `00-governance/` | Operating manual, reading ledger |
| `01-progress/` | Current state, next priorities |
| `02-overview/` | Product summary |
| `04-vendor-research/` | External SDK and protocol study, with source URLs and ranks |
| `06-architecture/` | Monorepo and per-package design |
| `07-decisions/` | Append-only decision log |
| `08-campaigns/` | Issue-campaign knowledge bases |
| `99-worklog/` | Dated logs, including every user directive |

- Record a design choice in `07-decisions/` the moment it is made. Entries are append-only; a later entry supersedes an earlier one rather than editing it.
- Update `01-progress/README.md` whenever a package or capability lands.
- Keep `06-architecture/` matching the code.
- Separate confirmed fact, with file paths, from inference. Cite external sources by URL and by the rank the [vendor research skill](../vendor-research/SKILL.md) defines.

`.wiki/` is not part of the committed contract population. A citation to working knowledge does not discharge a product promise.

## Package READMEs

Each package's `README.md` states what it is, why it exists, its public surface or domain folders, and the conventions a contributor needs. It must stand alone from the ignored `.wiki/`: link durable architecture to committed requirements, specifications, or JSDoc rather than to a private working path.

## Source JSDoc

Source JSDoc states what the type or function is and the non-obvious why: the design intent, the constraint it carries. It does not paraphrase the signature.

Close an interface type with `@author Samchon`. Examples in JSDoc are direction, not contract.

When a public export participates in the committed contract graph, its `@evidence` citations are owned by the [evidence graph skill](../evidence-graph/SKILL.md). This skill owns the prose; that one owns which layers are cited and whether the citation is truthful.

## Agent instructions

`AGENTS.md` and `SKILL.md` files are operational documents for humans and agents. `AGENTS.md ## Maintenance` decides where a rule belongs; these rules decide how it is written. A revision should read as if it had always been there.

- **Optimize for comprehension, not minimum length.** A shorter document that forces the reader to infer prerequisites, reasons, exceptions, or stop conditions is not concise.
- **Remove repetition, not substance.** State a rule once at its owning document and link to it elsewhere. Keep the rationale when it prevents a plausible mistake.
- **Give each paragraph one job.** Split purpose, rule, rationale, procedure, and consequence when combining them would make the reader unpack a dense block.
- **Use structure as compression.** Numbered lists for ordered procedures, bullets for choices or checklists, tables for repeated mappings, code blocks for exact commands.
- **State the rule before its reason.** Use negative phrasing only for a named failure mode the affirmative rule does not already exclude.
- **Skills point, not paraphrase.** Do not restate what `.wiki/`, a README, or a source comment already says; link to it.

## Instruction authority

Give every instruction one canonical semantic owner. Edit that owner first, then make every caller a link, a trigger, or an exact handoff sentence that adds only the caller's context.

| Instruction surface | Canonical ownership |
| --- | --- |
| Root `AGENTS.md` | Repository-wide attitude and the skill trigger index. Its H2 surface is `Attitude`, `Skills`, and `Maintenance`. |
| `.agents/skills/<name>/SKILL.md` | One concern's trigger, exclusions, shared invariants, and direct routes. |
| Documentation skill | Instruction classification, writing form, link integrity, README and JSDoc form, the repository voice, and the instruction-diff review gate. |
| Development skill | Source and test rules, package boundaries, consequence analysis, the coverage obligation, validation, change integrity. |
| Review skill | Whole-surface, fresh-round review semantics and Self-Review. |
| Issue-campaign skill | Discovery, adjudication, publication, per-issue implementation ownership, and completion. |
| Pull-request skill | Branch, commit, push, check, merge, and cleanup behavior. |
| Vendor research skill | Source ranks, what counts as citable, and where findings are recorded. |
| Hardware verification skill | What only the device can settle and how a measurement is recorded. |
| `docs/requirements/`, `docs/specifications/`, package READMEs, public JSDoc | Product promises, system contracts, package use, and public API meaning. |

When a procedure crosses owners, write the handoff as the condition, the named destination, and what authority transfers. Do not copy the destination's completion rule, command list, or failure policy into the caller.

Review every changed instruction literally with its linked callers. Check frontmatter, directory and `name` agreement, trigger scope, links, unique ownership, and contradictory or duplicate completion points. After corrections stop, require two consecutive complete instruction-diff rounds with no finding and no edit.

## Prose line breaks

Write each Markdown paragraph on one source line. Never hard-wrap a paragraph at a fixed column: Markdown already soft-wraps it, while manual wrapping makes small edits reflow unrelated lines.

One source line does not mean one long paragraph. Insert a blank line whenever the idea changes. Keep structural line breaks for paragraphs, list items, headings, tables, and fenced code.

Markdown has no repository formatter, so a Markdown diff is read rather than checked by a tool. The [pull-request skill](../pull-request/SKILL.md#commit-logical-units) owns what that means at commit time.

## Voice

Plain and direct. State the fact and stop.

- No em dashes. Use a period, comma, colon, or parentheses, whichever the sentence actually needs.
- No emoji.
- No spaced double hyphen in prose. CLI separators remain code and are not prose.
- No filler adjectives: "powerful", "seamless", "robust", "effortless".
- No AI-cliche phrasing: "not only X but also Y", "whether you're X or Y", "it's worth noting", "let's dive in", "delve into", "leverage" for "use", and reflexive hedging.
- No wrap-up sentence that just restates the paragraph.
- No mannered prose. Use the literal phrase where one exists. Mannered prose puts metaphor in its place, writing "a dial worth turning" for "a parameter worth varying", which makes the reader work so the writer can perform and drags in connotations nobody chose.

Code syntax, literal values, and quoted evidence keep their original meaning; they are not prose to rewrite for voice. The [instruction-diff review](#instruction-authority) owns the gate.
