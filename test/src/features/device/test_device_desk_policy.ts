import { CodeHudAgentPolicy } from "@codehud/agent";
import type { ICodeHudAgentAdapter } from "@codehud/interface";
import { CodeHudDeskCommand } from "@codehud/simulator";

import { Assert } from "../internal/assert";

/**
 * A session can be started under a policy somebody chose.
 *
 * `IOpenProps.policy` carries its own reason for existing: "Stated when the
 * work begins, because the right answer differs between a scratch repository
 * and one that deploys." Nothing stated it. The desk host read `--kind`,
 * `--columns`, `--rows` and the directories from a command line and passed one
 * frozen constant, so the sentence was true and unreachable, and the only
 * product that exists offered exactly one answer to a question the contract
 * says has several.
 *
 * That is also why #106 could not be answered as posed. It asks whether
 * executions should be doubly-confirmed by default; the measured cost is about
 * two extra spoken words per session, which is worth paying *if somebody who
 * does not want to pay it can say so*. They could not, so inverting the default
 * would have made the product stricter for everyone with no way out.
 *
 * Three rungs rather than a free partition, because a wearer cannot compose one
 * by voice and a person at a terminal should not have to either. The four
 * irreversible classes are confirmed on every rung: a rung that loosened those
 * would remove the promise rather than trade it for speed.
 *
 * Scenarios:
 *
 * 1. Naming no rung gives the one the specification fixes, so a session started
 *    without a word behaves as it always has.
 * 2. Each rung differs from its neighbours where it is supposed to and nowhere
 *    else: reads are unattended throughout, and the four irreversible classes
 *    are confirmed throughout.
 * 3. `careful` is #106's proposal — writes, executions and anything leaving the
 *    machine all take two words — and `flowing` is its opposite for a desk.
 * 4. A rung nobody offers is refused rather than quietly replaced. A wearer who
 *    asked for `careful` and silently received `standard` has been told their
 *    statement took effect when it did not, which is the same shape as the
 *    allowance that named the wrong shell in #123.
 * 5. Each rung translates into a launch the harness understands, and the gate
 *    is never removed on any of them.
 */
export async function test_device_desk_policy(): Promise<void> {
  const irreversible: ICodeHudAgentAdapter.IPolicy.Action[] = [
    "delete",
    "history",
    "publish",
    "credential",
  ];

  // 1. The default is the specification's partition, unchanged.
  Assert.equals(
    "naming no rung gives the partition the specification fixes",
    CodeHudDeskCommand.rung(undefined),
    CodeHudDeskCommand.POLICY,
  );
  Assert.equals(
    "which is the same one the harness side calls its default",
    CodeHudDeskCommand.rung(undefined).actions,
    CodeHudAgentPolicy.DEFAULT.actions,
  );

  // 2. What holds on every rung.
  for (const name of Object.keys(CodeHudDeskCommand.RUNGS)) {
    const policy: ICodeHudAgentAdapter.IPolicy = CodeHudDeskCommand.rung(name);
    Assert.equals(
      `${name} leaves reads unattended, because asking about one spends the budget`,
      policy.actions["read"],
      "unattended",
    );
    Assert.equals(
      `${name} confirms every irreversible class`,
      irreversible.filter((action) => policy.actions[action] !== "confirmed"),
      [],
    );
    Assert.predicate(
      `${name} never removes the gate`,
      CodeHudAgentPolicy.mode() === "manual",
    );
  }

  // 3. What each rung is for.
  Assert.equals(
    "careful is the proposal in #106, available rather than imposed",
    [
      CodeHudDeskCommand.rung("careful").actions["write"],
      CodeHudDeskCommand.rung("careful").actions["execute"],
      CodeHudDeskCommand.rung("careful").actions["network"],
    ],
    ["confirmed", "confirmed", "confirmed"],
  );
  Assert.equals(
    "and flowing is its opposite, for somewhere the wearer can see what happens",
    [
      CodeHudDeskCommand.rung("flowing").actions["execute"],
      CodeHudDeskCommand.rung("flowing").actions["network"],
    ],
    ["unattended", "unattended"],
  );
  Assert.equals(
    "which still does not loosen writing, because a write outlives the glance",
    CodeHudDeskCommand.rung("flowing").actions["write"],
    "attended",
  );

  // 4. A name nobody offers.
  await Assert.throws("a rung that does not exist is refused", () =>
    CodeHudDeskCommand.rung("reckless"),
  );
  Assert.predicate(
    "and the refusal names what it would have taken",
    ((): boolean => {
      try {
        CodeHudDeskCommand.rung("reckless");
        return false;
      } catch (thrown: unknown) {
        const message: string = String(thrown);
        return Object.keys(CodeHudDeskCommand.RUNGS).every((name) =>
          message.includes(name),
        );
      }
    })(),
  );

  // 5. Each rung reaches the harness as something it understands.
  Assert.equals(
    "careful allows nothing by name beyond reading",
    CodeHudAgentPolicy.allowed(CodeHudDeskCommand.rung("careful")),
    CodeHudAgentPolicy.allowed(CodeHudDeskCommand.rung("standard")),
  );
  Assert.predicate(
    "and flowing allows every shell, which is the whole of what it is for",
    ["Bash", "PowerShell", "Task"].every((tool) =>
      CodeHudAgentPolicy.allowed(CodeHudDeskCommand.rung("flowing")).includes(
        tool,
      ),
    ),
  );
}
