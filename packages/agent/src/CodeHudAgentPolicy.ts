import type { ICodeHudAgentAdapter } from "@codehud/interface";

/**
 * What a session's permission policy means to a harness.
 *
 * A namespace: nothing here holds state, and both adapters read the same table
 * so that one spoken policy means the same thing on either. A wearer who said
 * "reads are fine, ask me about everything else" has to get that on both, or
 * the policy is a word rather than a rule.
 *
 * The two harnesses express permission differently. Claude Code takes a mode
 * and a list of tools that need no asking. Codex takes an approval policy and a
 * sandbox. Neither speaks in terms of read, write, execute; the mapping between
 * those and what each binary understands is this file's whole job.
 *
 * Two rules hold on both sides and are the reason this is a table rather than
 * two ad-hoc translations:
 *
 * **The gate is never removed.** Claude Code offers `bypassPermissions` and
 * Codex offers an approval policy of `never`. Neither is ever selected, at any
 * policy, because a session with no gate is a session the wearer is not in, and
 * the product is the wearer being in it.
 *
 * **A second confirmation is ours, not the harness's.** Neither binary has a
 * notion of asking twice in different words. So the doubly-confirmed class
 * reaches a harness as an ordinary approval request, and the second
 * confirmation happens before the answer is sent. Treating it as unattended
 * because the harness cannot express it would silently downgrade exactly the
 * actions the class exists to protect.
 *
 * @evidence requirements/agent-control/turn-and-approval.md#agent-approval-budget Translates the stated per-session budget into what each harness is actually launched with, so the same policy governs both.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-policy Implements the three classes against two harnesses, without ever selecting a configuration that removes the approval gate.
 * @author Samchon
 */
export namespace CodeHudAgentPolicy {
  /**
   * The tools Claude Code uses for each class of action.
   *
   * Read from `claude --help` and from what a real session reported it had
   * available, rather than from documentation. A tool this repository has not
   * seen is absent rather than guessed, because a guessed one could let
   * something through unasked.
   *
   * What the first version of this sentence also said is that a missing
   * allowance "only costs a wearer an extra question". That was wrong in the
   * direction that matters, and it was measured wrong rather than argued wrong.
   * `execute` was allowed as `Bash` and `Task`; the harness on Windows runs
   * commands through a tool called `PowerShell` and says so in its own
   * `system/init`, naming a `powershell_path`. One instruction that ran the
   * test suite twice:
   *
   * ```text
   * --allowedTools=Bash,Task              the wearer is asked   2 times
   * --allowedTools=Bash,Task,PowerShell   the wearer is asked   0 times
   * ```
   *
   * A missing allowance on an execute-class tool does not cost one question. It
   * costs one per command, for the life of the session, and it costs it while
   * the wearer believes they said otherwise — which is the failure
   * `#agent-approval-budget` names as the one that makes the product unusable.
   *
   * So the two directions are not symmetric and are not treated as such. An
   * allowance for a tool that is gone is harmless and stays. A tool that is
   * *seen* goes in, and `PowerShell` is seen.
   */
  export const CLAUDE_TOOLS: Readonly<
    Record<ICodeHudAgentAdapter.IPolicy.Action, readonly string[]>
  > = Object.freeze({
    read: Object.freeze(["Read", "Glob", "Grep", "NotebookRead"]),
    write: Object.freeze(["Write", "Edit", "NotebookEdit"]),
    execute: Object.freeze(["Bash", "PowerShell", "Task"]),
    network: Object.freeze(["WebFetch", "WebSearch"]),
    delete: Object.freeze([]),
    history: Object.freeze([]),
    publish: Object.freeze([]),
    credential: Object.freeze([]),
  });

  /**
   * The tools a policy says may run without asking.
   *
   * Only the unattended class contributes. Attended and doubly-confirmed both
   * have to reach the wearer, and the difference between them is what happens
   * on this side of the connection rather than what the harness is told.
   *
   * The four classes with no tools of their own — deletion, history rewriting,
   * publication, credential exposure — are things a harness does *through*
   * `Bash` rather than through a tool of their own. They can therefore never be
   * allowed by name, which is the conservative direction: they stay behind the
   * execute gate, and a wearer who made execution unattended has said so.
   */
  export const allowed = (policy: ICodeHudAgentAdapter.IPolicy): string[] => {
    const tools: string[] = [];
    for (const [action, treatment] of Object.entries(policy.actions))
      if (treatment === "unattended")
        tools.push(
          ...CLAUDE_TOOLS[action as ICodeHudAgentAdapter.IPolicy.Action],
        );
    return [...new Set(tools)].sort((a, b) => a.localeCompare(b));
  };

  /**
   * The permission mode Claude Code is launched in.
   *
   * Always `manual`, at every policy. The mode decides what the harness settles
   * by itself, and the allowance list is what says which of those are fine; a
   * mode that pre-approves edits would make the list meaningless and the
   * wearer's policy unenforceable.
   *
   * `bypassPermissions` exists and is never returned. A session with no gate is
   * a session the wearer is not in.
   */
  export const mode = (): "manual" => "manual";

  /**
   * The approval policy Codex is started with.
   *
   * `untrusted` asks about everything, which is what a policy with anything
   * attended or doubly-confirmed in it means. `on-request` is reserved for the
   * case where the wearer has made every class unattended, and even then Codex
   * still asks before leaving its sandbox.
   *
   * `never` is never returned, for the same reason `bypassPermissions` is not.
   */
  export const approval = (
    policy: ICodeHudAgentAdapter.IPolicy,
  ): "untrusted" | "on-request" => {
    const stated: ICodeHudAgentAdapter.IPolicy.Treatment[] = Object.values(
      policy.actions,
    ).filter(
      (value): value is ICodeHudAgentAdapter.IPolicy.Treatment =>
        value !== undefined,
    );
    return stated.length > 0 && stated.every((t) => t === "unattended")
      ? "on-request"
      : "untrusted";
  };

  /**
   * The sandbox Codex is started in.
   *
   * Opens to the workspace only when the wearer has said writing needs no
   * asking. `danger-full-access` is never returned: a policy that removes the
   * sandbox is a decision to make at a keyboard, with the whole of it visible,
   * rather than by speaking a sentence to a display with two lines.
   */
  export const sandbox = (
    policy: ICodeHudAgentAdapter.IPolicy,
  ): "read-only" | "workspace-write" =>
    policy.actions["write"] === "unattended" ? "workspace-write" : "read-only";

  /**
   * Whether an action needs a second, differently worded confirmation.
   *
   * Asked on this side of the connection, because neither harness can ask
   * twice. The harness sees one approval request; whether the wearer has to
   * clear two is decided here before the answer is sent.
   */
  export const doubled = (
    policy: ICodeHudAgentAdapter.IPolicy,
    action: ICodeHudAgentAdapter.IPolicy.Action,
  ): boolean => policy.actions[action] === "confirmed";

  /**
   * The policy a session gets when the wearer has not said otherwise.
   *
   * Exactly the defaults the specification states: reads proceed, anything that
   * writes or executes or leaves the machine asks, and the four that cannot be
   * undone ask twice.
   */
  export const DEFAULT: ICodeHudAgentAdapter.IPolicy = Object.freeze({
    actions: Object.freeze({
      read: "unattended",
      write: "attended",
      execute: "attended",
      network: "attended",
      delete: "confirmed",
      history: "confirmed",
      publish: "confirmed",
      credential: "confirmed",
    }),
  });
}
