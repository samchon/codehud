import { CodeHudCodexNormalizer } from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";

import { Assert } from "../internal/assert";
import { Codex } from "../internal/codex";

/**
 * The Codex adapter turns real server output into observations, and drops the
 * rest.
 *
 * Driven by captures from `codex-cli 0.154.0`. That matters more here than it
 * did for Claude Code, because Codex generates its own types and it is tempting
 * to write a mapping from them: `ThreadItem` declares nineteen variants and an
 * ordinary turn emits four, so most of a type-driven mapping would be rules for
 * situations nothing produces.
 *
 * Scenarios:
 *
 * 1. The counter starts at zero, ascends by one, and never skips, so the
 *    bridge's own stamping agrees with the adapter's rather than papering over
 *    it.
 * 2. The bookkeeping produces nothing: rate limits, token usage, hooks, MCP
 *    startup, remote control status, the running diff of the turn, and the
 *    wearer's own message handed back. The list is not a fixed length — the
 *    diff notification appeared only when a capture that writes a file was
 *    added — so each member is named and each is fed in alone.
 * 3. A command is reported under one identifier across both phases, and the
 *    finish carries the description the start made.
 * 4. A command the wearer declined is marked failed; one that ran is not. This
 *    is the distinction the fixtures were recaptured to contain.
 * 5. An approval quotes the server's own request identifier, and its options
 *    carry the server's own decision words, because the session sends them
 *    straight back rather than translating.
 * 6. Prose arrives once. The deltas carry the words and the completed item
 *    terminates them, so a fold does not double the sentence.
 * 7. An empty reasoning item produces nothing. These captures contain one, and
 *    an empty observation would spend a line of a two-line display saying
 *    nothing.
 */
export async function test_agent_codex_normalize(): Promise<void> {
  const run = (
    stream: Codex.IMessage[],
    streaming: boolean = true,
  ): ICodeHudAgentEvent[] => {
    const normalizer: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
      "s1",
      () => 0,
    );
    normalizer.streaming = streaming;
    return Codex.sent(stream).flatMap((message) =>
      normalizer.normalize(message as CodeHudCodexNormalizer.IMessage),
    );
  };

  for (const { name, stream } of Codex.ALL) {
    const events: ICodeHudAgentEvent[] = run(stream);
    Assert.equals(
      `${name} counts from zero without a gap`,
      events.map((event) => event.sequence),
      events.map((_, index) => index),
    );
    Assert.predicate(`${name} produced something`, events.length > 0);
    Assert.equals(
      `${name} ends with a result`,
      events[events.length - 1]?.type,
      "result",
    );
  }

  // Absorbed. Fed alone, each produces nothing at all.
  for (const method of [
    "account/rateLimits/updated",
    "thread/tokenUsage/updated",
    "hook/started",
    "hook/completed",
    "mcpServer/startupStatus/updated",
    "remoteControl/status/changed",
    "thread/status/changed",
    "serverRequest/resolved",
    "turn/diff/updated",
  ]) {
    const line: Codex.IMessage | undefined = Codex.ALL.flatMap(
      ({ stream }) => stream,
    ).find((candidate) => candidate.method === method);
    Assert.predicate(`${method} was actually captured`, line !== undefined);
    Assert.equals(`${method} becomes no observation`, run([line!]).length, 0);
  }

  const echoed: Codex.IMessage | undefined = Codex.sent(Codex.PLAIN).find(
    (line) => Codex.item(line) === "userMessage",
  );
  Assert.equals(
    "the wearer's own message is not handed back to them",
    run([echoed!]).length,
    0,
  );

  const phases = run(Codex.APPROVE).filter(
    (event): event is ICodeHudAgentEvent.ITool => event.type === "tool",
  );
  Assert.predicate("a command was reported", phases.length >= 2);
  Assert.equals(
    "under one identifier",
    new Set(phases.map((event) => event.call)).size,
    phases.length / 2,
  );
  Assert.equals(
    "starting then finishing",
    phases.slice(0, 2).map((event) => event.phase),
    ["start", "finish"],
  );
  Assert.equals(
    "and the finish carries the description the start made",
    phases[1]!.title,
    phases[0]!.title,
  );
  Assert.predicate(
    "which names what was run rather than the interpreter that ran it",
    phases[0]!.title.includes("echo hello") &&
      phases[0]!.title.includes("powershell") === false,
  );
  Assert.equals(
    "a command that ran is not marked failed",
    phases[1]!.failed,
    undefined,
  );

  const declined = run(Codex.REFUSE).filter(
    (event): event is ICodeHudAgentEvent.ITool => event.type === "tool",
  );
  Assert.equals(
    "a command the wearer declined is marked failed",
    declined[1]?.failed,
    true,
  );

  const approval = run(Codex.APPROVE).find(
    (event): event is ICodeHudAgentEvent.IPermission =>
      event.type === "permission",
  );
  const asked: Codex.IMessage | undefined = Codex.sent(Codex.APPROVE).find(
    (line) => line.method === "item/commandExecution/requestApproval",
  );
  Assert.predicate("an approval was produced", approval !== undefined);
  Assert.equals(
    "quoting the server's own request identifier",
    approval?.request,
    String(asked?.id),
  );
  Assert.equals(
    "and offering the server's own decision words",
    approval?.options.map((option) => option.id),
    ["accept", "decline"],
  );
  Assert.equals(
    "exactly one of which advances the agent",
    approval?.options.filter((option) => option.affirmative === true).length,
    1,
  );
  Assert.equals(
    "and neither persists",
    approval?.options.every((option) => option.persistent === false),
    true,
  );

  // Prose arrives twice on the wire; it must arrive once in the fold.
  const spoken: string = Codex.sent(Codex.PLAIN)
    .filter((line) => line.method === "item/agentMessage/delta")
    .map((line) => line.params?.delta ?? "")
    .join("");
  const folded: string = run(Codex.PLAIN)
    .filter(
      (event): event is ICodeHudAgentEvent.IMessage => event.type === "message",
    )
    .map((event) => event.delta)
    .join("");
  Assert.predicate("the agent said something", spoken.length > 0);
  Assert.equals("and it reaches the fold once", folded, spoken);

  const reasoning: Codex.IMessage | undefined = Codex.sent(Codex.REFUSE).find(
    (line) => Codex.item(line) === "reasoning",
  );
  Assert.predicate("a reasoning item was captured", reasoning !== undefined);
  Assert.equals(
    "and an empty one produces no observation",
    run([reasoning!]).length,
    0,
  );
}
