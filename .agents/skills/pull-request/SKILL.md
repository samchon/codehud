---
name: pull-request
description: Defines CodeHUD branch, commit, pull-request, check-reading, and merge workflows. Use when shipping a topic-unit PR under the standing instruction, when the user asks to open, update, or merge a pull request, or when the standing autonomous mandate authorizes end-to-end delivery.
---

# Pull Request Submission

Two standing user instructions govern when this workflow runs and how far it goes. [AGENTS.md's `## Attitude`](../../../AGENTS.md#attitude) owns their wording: work ships in topic-unit pull requests, and the published issues are conquered one at a time and merged without asking.

This skill owns what each step of that delivery does. The mandate is the request for every step it names, including push and merge, and every check, verification, and Self-Review gate still applies to each step.

Outside the mandate, permission to open is not permission to merge. Merge only when the user explicitly asks.

## Branch From The Target

Branch from the PR target (`master` unless stated otherwise). Name the branch after the change: `feat/<scope>`, `fix/<scope>`, `test/<scope>`, `docs/<scope>`, `chore/<scope>`, `ci/<scope>`.

Work uses the current checkout and one topic branch. Do not create another clone or worktree. If unrelated work prevents a safe branch switch, preserve it and report the blocker rather than stashing, reverting, or mixing it.

## Every Commit Leaves A Working Tree

A commit that cannot install, cannot build, or wires a script to something absent is broken even when a later commit repairs it. Verify against a fresh clone of the branch head when the change touches the workspace manifest, the lockfile, or a root script.

This is not theoretical. The first scaffold commit in this repository shipped a stale lockfile that dirtied every fresh install and a root script that exited 2 on a missing config, and both were found by cloning the branch rather than by reading the diff.

## Commit Logical Units

One commit per coherent unit, not a single mega-commit when the diff is large. Use `<type>(<scope>): <subject>`, and end the message with the `Co-Authored-By` trailer the session's attribution names.

Run `pnpm run format` before commits that change TypeScript. For Markdown-only commits, inspect the diff directly and run `git diff --check`.

Stage explicit paths when the worktree is mixed. Never include unrelated changes silently.

## Write The Pull Request

Write the PR body at open: intent, scope, deferred items, test plan. Treat it as the PR's historical intent statement, and use a file-backed body for multiline Markdown.

Do not rewrite the body on every follow-up push. Record later fixes, newly found issues, and Self-Review results as formal pull-request reviews with the `COMMENT` event so the thread preserves chronology. Use an inline review comment when an observation belongs to a changed line, and the review body for commit-wide results. Never `APPROVE` or `REQUEST_CHANGES` on your own pull request.

The title describes the merged outcome in `<type>(<scope>)` style, not the work process.

When the PR closes a published issue, say so with a closing keyword in the body so the issue closes on merge.

## Read Checks For The Applicable Head

After every push, watch `gh pr checks <PR>` until each check settles. On failure, fetch the job log, diagnose the real cause, fix it in place, push a new commit, and let the checks resume.

Do not treat a green unrelated job as acceptance for a failed required surface, and do not treat a job that ran nothing as acceptance for anything. The [development skill](../development/SKILL.md#work-rules) owns why a check that matched no target is not a check.

Where a required workflow does not exist yet, say so in the Self-Review and record the local verification that stood in for it. Do not describe a missing check as passing.

## Merge

Under the standing autonomous mandate, or when the user explicitly asks, and once every required check passes: squash-merge and delete the branch.

After GitHub records the merge, observe the `master` push checks on the exact merge commit. A green pull-request head does not substitute for the post-merge event, and a red master run reopens delivery work immediately.

If CI is red because code, tests, build, formatting, or generated artifacts failed, fix the PR and wait for green.

If CI cannot start or finish for repository infrastructure reasons outside the topic's scope, report the exact blocker, document the local verification in the PR, and merge only after the user repeats the instruction. Do not force-merge against branch protection.
