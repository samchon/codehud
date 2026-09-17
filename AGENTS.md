# AGENTS.md

`glasses` drives Claude Code and Codex from smart glasses. Speech is the only instruction channel, the display is read and reviewed but never operated, and the harness runs on the machine that holds the repository rather than in a vendor's cloud.

What it delivers is supervision and control of a long-running, approval-demanding coding agent from a wearable surface. The reduction that turns an agent's output into something readable in a two-second glance is the product; transport and vendor connectivity are the plumbing under it.

## Attitude

Follow the literal request; it is the contract, not a hint at what the user "really" wants.

- **The user outranks a skill.** A direct user instruction takes precedence over anything in this file, a `SKILL.md`, or a topic document, and a standing instruction recorded here holds that same authority until the user changes it. An override is something the user said; infer none from a terse request, a deadline, or the cost of complying.
- **Name the instruction that stopped you.** When a skill would make you pause, ask permission, refuse, or narrow what the user asked for, quote the exact file and sentence that produced the hesitation before you act on it or set it aside.
- **Scope is the user's to widen.** Reinterpret the goal, weigh alternatives, or expand the task only on an explicit hand-off. Take a confident, specific ask as given. A pre-existing defect or a cleanup you notice while working belongs in your closing report as a follow-up.
- **Fidelity binds the goal, not the effort.** Within that goal, act with full initiative: do the substeps it needs, verify your work, surface what you notice.
- **Match the user's language.** Communicate in English when the user writes in English and in Korean when the user writes in Korean. Source, comments, and every document in this repository are English regardless of which language the conversation uses.
- **Choose the principled course.** Decide from correctness, evidence, product boundaries, and the durable consequence. Work size, difficulty, and blast radius change how much investigation a decision needs; they never change the standard it must meet.
- **Recall is a hypothesis, and vendor recall is a bad one.** This project depends on smart-glasses SDKs, harness protocols, and platform APIs that move faster than any training cutoff. Recognizing the name of an SDK, a method, a flag, or a product is not knowing its current state. Read the installed version or the current primary documentation before acting, and cite what you read. The [vendor research skill](.agents/skills/vendor-research/SKILL.md) owns how.
- **Trace the consequence surface.** A named file or failing case is the starting point, not the investigation boundary. Follow the same cause through downstream consumers, side effects, state transitions, and boundary cases.
- **Default over ask.** On an ambiguous detail, pick the sensible default and say what you chose; reserve questions for forks only the user can settle.
- **Finish the turn's work.** A turn ends when the work is done. When your last paragraph is a plan or a promise, take that step now.
- **Record every user directive.** Preserve each user instruction in the durable `.wiki/` worklog and track its implementation. The [documentation skill](.agents/skills/documentation/SKILL.md) owns the record's form and location.
- **Ship each topic as a PR.** Standing instruction (user, 2026-09-17): every topic-unit of work is submitted as its own pull request; never commit to `master` directly.
- **Conquer the issue list.** Standing autonomous mandate (user, 2026-09-17): work the published issues one at a time as a solo issue campaign, each through implementation, Self-Review rounds, and green CI, and merge each one without asking. The mandate is the request for every step it names, including push and merge, and every gate still applies to each step.

## Skills

Durable project conventions and workflows live under `.agents/skills/`. Read the linked skill when its topic applies.

### Project Outline

Product contract, deliberate exclusions, workspace layout, and canonical commands. Read the [project skill](.agents/skills/project/SKILL.md) when orienting, working inside any package, or judging whether a proposed capability is in scope.

### Development

Implementation rules, package boundaries, testing standards, the coverage obligation, validation, and change integrity. Read the [development skill](.agents/skills/development/SKILL.md) before writing or modifying source, tests, workflows, or package wiring.

### Documentation

The `.wiki/` knowledge base, package READMEs, source JSDoc, agent-instruction form, and the repository writing voice. Read the [documentation skill](.agents/skills/documentation/SKILL.md) before writing or modifying any document, and revise the wiki as the work proceeds rather than at the end.

### Evidence Graph

The committed trace from requirements through specifications to public exports, its populations, citations, and exclusions. Read the [evidence graph skill](.agents/skills/evidence-graph/SKILL.md) before adding or moving a contract document, changing a public export's citations, or reshaping `evidence.config.ts`.

### Review

Whole-surface, fresh-round review and Self-Review. Read the [review skill](.agents/skills/review/SKILL.md) for every self-review or unqualified review request, and as the review mode inside an issue campaign.

### Pull Request Submission

Branch, commit, pull-request body, check reading, and merge behavior. Read the [pull-request skill](.agents/skills/pull-request/SKILL.md) when shipping a topic-unit PR or when a mandate authorizes end-to-end delivery.

### Issue Campaign

Solo discovery, adjudication, publication, then one issue at a time through implementation, Self-Review, CI, and merge. Read the [issue-campaign skill](.agents/skills/issue-campaign/SKILL.md) for broad audits and for working the published issue list.

### Vendor Research

How to establish what a smart-glasses SDK, a harness protocol, or a platform API actually does today, and what counts as a citable answer. Read the [vendor research skill](.agents/skills/vendor-research/SKILL.md) before asserting any vendor capability, limit, or method signature.

### Hardware Verification

How to settle a claim that only the physical device can settle, and how to record the result so the next session does not repeat the measurement. Read the [hardware verification skill](.agents/skills/hardware-verification/SKILL.md) when an issue is labelled `hardware` or when a design decision rests on an unmeasured device behavior.

## Maintenance

### Writing style

`AGENTS.md` and `SKILL.md` files are read by humans as well as agents. Read the documentation skill's [Instruction authority](.agents/skills/documentation/SKILL.md#instruction-authority) section before editing either; it owns instruction classification, semantic ownership, writing form, link integrity, and the review gate.

### AGENTS.md

This is the single shared entry point for both Claude Code (via `CLAUDE.md -> @AGENTS.md`) and Codex CLI. Keep it to the brief product identity, global attitude, and the skill index. The H2s are `## Attitude`, `## Skills`, and `## Maintenance`; `## Attitude` is the one place global agent-behavior rules live.

Update this file only for repository-contract changes: a new skill area, a renamed or merged skill, a workflow that no longer fits an existing skill, or an agent rule that applies globally before any skill loads.

### Skills

- **Location.** `.agents/skills/<kebab-name>/SKILL.md`. No numeric prefix. Each file opens with YAML frontmatter whose `name` matches the directory and whose third-person `description` states what the skill covers and when to use it; Codex requires the frontmatter to load the skill. Claude Code only auto-discovers `.claude/skills/`, so it reads these through the pointers above.
- **Core in SKILL.md, conditional topics as sibling documents.** Keep always-applicable procedure in `SKILL.md`. Move a topic needed only under a specific condition to a one-level-deep sibling document and link it with that read condition.
- **Two trigger surfaces, one scope.** The frontmatter description is the full trigger contract, including exclusions. The pointer above mirrors that scope more briefly. Correct the frontmatter first when the scope changes.
- **Create or merge.** Add a skill when a substantial repository concern would otherwise inflate this file beyond an index. Merge sibling concerns when they share most of their structure.
- **Headings are plain.** No chapter numbers in skill or `AGENTS.md` headings.
- **Current set.** `project`, `development`, `documentation`, `evidence-graph`, `review`, `pull-request`, `issue-campaign`, `vendor-research`, and `hardware-verification`.
