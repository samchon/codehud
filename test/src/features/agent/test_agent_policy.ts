import { CodeHudAgentPolicy } from "@codehud/agent";
import type { ICodeHudAgentAdapter } from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

/**
 * One spoken policy means the same thing on both harnesses.
 *
 * A wearer says what needs asking once, at the start of the work, and the two
 * binaries express permission in entirely different terms: Claude Code takes a
 * mode and a list of tools that need no asking, Codex takes an approval policy
 * and a sandbox. If the translation drifts, the policy is a word rather than a
 * rule, and the difference shows up as an action going through unasked on one
 * harness that would have stopped on the other.
 *
 * The rule that matters most is the one about not removing the gate. Both
 * binaries offer a setting that turns approvals off entirely — Claude Code's
 * `bypassPermissions`, Codex's `never` — and neither is reachable from any
 * policy. A session with no gate is a session the wearer is not in, and the
 * wearer being in it is the product.
 *
 * Scenarios:
 *
 * 1. The default policy is exactly what the specification states: reads
 *    proceed, writing and executing and leaving the machine ask, and the four
 *    that cannot be undone ask twice.
 * 2. Under that policy, reads need no asking on Claude Code and nothing else
 *    does.
 * 3. The same policy makes Codex ask about everything, in its own vocabulary.
 * 4. Making writes unattended opens the Codex sandbox and allows the writing
 *    tools by name, on both, from one statement.
 * 5. No policy, however permissive, ever selects a configuration that removes
 *    the gate. This is checked over every combination rather than argued.
 * 6. The permission mode never changes, because the allowance list is what
 *    carries the policy and a mode that pre-approved edits would make it
 *    unenforceable.
 * 7. Doubly-confirmed is never treated as unattended. Neither harness can ask
 *    twice, and downgrading it there would silently remove the protection from
 *    exactly the actions that cannot be undone.
 */
export async function test_agent_policy(): Promise<void> {
  const defaults = CodeHudAgentPolicy.DEFAULT;

  TestValidator.equals("the stated defaults, exactly", defaults.actions, {
    read: "unattended",
    write: "attended",
    execute: "attended",
    network: "attended",
    delete: "confirmed",
    history: "confirmed",
    publish: "confirmed",
    credential: "confirmed",
  });

  TestValidator.equals(
    "reads need no asking, and nothing else is allowed by name",
    CodeHudAgentPolicy.allowed(defaults),
    ["Glob", "Grep", "NotebookRead", "Read"],
  );
  TestValidator.equals(
    "and Codex is told to ask about everything",
    CodeHudAgentPolicy.approval(defaults),
    "untrusted",
  );
  TestValidator.equals(
    "with a sandbox that does not write",
    CodeHudAgentPolicy.sandbox(defaults),
    "read-only",
  );

  // One statement, both harnesses.
  const writing: ICodeHudAgentAdapter.IPolicy = {
    actions: { ...defaults.actions, write: "unattended" },
  };
  TestValidator.predicate(
    "allowing writes allows the writing tools by name",
    CodeHudAgentPolicy.allowed(writing).includes("Write") &&
      CodeHudAgentPolicy.allowed(writing).includes("Edit"),
  );
  TestValidator.equals(
    "and opens the sandbox on the other harness",
    CodeHudAgentPolicy.sandbox(writing),
    "workspace-write",
  );
  TestValidator.equals(
    "while still asking about everything else",
    CodeHudAgentPolicy.approval(writing),
    "untrusted",
  );

  // The gate, over every policy there is.
  const actions: ICodeHudAgentAdapter.IPolicy.Action[] = [
    "read",
    "write",
    "execute",
    "network",
    "delete",
    "history",
    "publish",
    "credential",
  ];
  const treatments: ICodeHudAgentAdapter.IPolicy.Treatment[] = [
    "unattended",
    "attended",
    "confirmed",
  ];

  let checked: number = 0;
  for (const treatment of treatments)
    for (const action of actions) {
      const policy: ICodeHudAgentAdapter.IPolicy = {
        actions: { ...defaults.actions, [action]: treatment },
      };
      checked += 1;
      TestValidator.predicate(
        `${action} as ${treatment} never removes the gate on Claude Code`,
        CodeHudAgentPolicy.mode() === "manual",
      );
      TestValidator.predicate(
        `${action} as ${treatment} never removes it on Codex either`,
        CodeHudAgentPolicy.approval(policy) !== ("never" as string),
      );
      TestValidator.predicate(
        `${action} as ${treatment} never opens the sandbox fully`,
        CodeHudAgentPolicy.sandbox(policy) !== ("danger-full-access" as string),
      );
    }
  TestValidator.predicate("every combination was checked", checked === 24);

  // The most permissive policy expressible still asks before leaving the box.
  const permissive: ICodeHudAgentAdapter.IPolicy = {
    actions: Object.fromEntries(
      actions.map((action) => [action, "unattended"]),
    ) as ICodeHudAgentAdapter.IPolicy["actions"],
  };
  TestValidator.equals(
    "an entirely unattended policy is the one case Codex relaxes for",
    CodeHudAgentPolicy.approval(permissive),
    "on-request",
  );
  TestValidator.equals(
    "and even that is not the same as no gate",
    CodeHudAgentPolicy.approval(permissive) !== ("never" as string),
    true,
  );

  // Doubly-confirmed is never quietly downgraded.
  const doubled: ICodeHudAgentAdapter.IPolicy = {
    actions: { ...defaults.actions, execute: "confirmed" },
  };
  TestValidator.equals(
    "a doubly-confirmed action is not allowed by name",
    CodeHudAgentPolicy.allowed(doubled).includes("Bash"),
    false,
  );
  TestValidator.equals(
    "and is recognized as needing a second answer on this side",
    CodeHudAgentPolicy.doubled(doubled, "execute"),
    true,
  );
  TestValidator.equals(
    "which an attended action does not",
    CodeHudAgentPolicy.doubled(defaults, "write"),
    false,
  );
}
