import { CodeHudClaudeNormalizer } from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Claude } from "../internal/claude";

/**
 * The adapter turns real harness output into observations, and drops the rest.
 *
 * Driven by captures from `claude 2.1.274` rather than by lines written to suit
 * the code. That is the point of having captured them: a normalizer checked
 * against input its author invented proves only that the author was consistent.
 *
 * Scenarios:
 *
 * 1. The counter starts at zero, ascends by one, and never skips. Absorbed
 *    lines leave no gap, which is what lets the bridge's own stamping agree
 *    with the adapter's rather than paper over it.
 * 2. Three real line kinds produce nothing at all: `rate_limit_event`,
 *    `system/status`, and `system/thinking_tokens`. A wearer would do nothing
 *    differently for any of them, and the vocabulary is closed on purpose.
 * 3. A tool is reported under one call identifier across both its phases, and
 *    the finish carries the description the start made, because the harness
 *    names only the call when it answers.
 * 4. A failed tool result is marked failed; a successful one is not.
 * 5. An approval carries the harness's own request identifier verbatim, so an
 *    answer can quote it back, and offers options that state their own
 *    advancing and persisting properties.
 * 6. A turn that was refused is reported as interrupted rather than failed: the
 *    wearer's own refusal is not an error.
 * 7. Reasoning is a different observation from prose, so the projection
 *    boundary can drop it first when space is scarce.
 */
export async function test_agent_claude_normalize(): Promise<void> {
  const run = (
    stream: Claude.IEnvelope[],
    streaming: boolean = true,
  ): ICodeHudAgentEvent[] => {
    const normalizer: CodeHudClaudeNormalizer = new CodeHudClaudeNormalizer(
      "s1",
      () => 0,
    );
    normalizer.streaming = streaming;
    return stream
      .filter((line) => line.__direction !== "host->harness")
      .flatMap((line) =>
        normalizer.normalize(line as CodeHudClaudeNormalizer.ILine),
      );
  };

  for (const { name, stream } of Claude.ALL) {
    const events: ICodeHudAgentEvent[] = run(stream);
    TestValidator.equals(
      `${name} counts from zero without a gap`,
      events.map((event) => event.sequence),
      events.map((_, index) => index),
    );
    TestValidator.predicate(`${name} produced something`, events.length > 0);
  }

  // Absorbed rather than translated. Fed alone, each produces nothing.
  for (const kind of [
    "rate_limit_event",
    "system/status",
    "system/thinking_tokens",
  ]) {
    const line: Claude.IEnvelope | undefined = Claude.ALL.flatMap(
      ({ stream }) => stream,
    ).find((candidate) => Claude.kind(candidate) === kind);
    TestValidator.predicate(
      `${kind} was actually captured`,
      line !== undefined,
    );
    TestValidator.equals(
      `${kind} becomes no observation`,
      run([line!]).length,
      0,
    );
  }

  const tooled: ICodeHudAgentEvent[] = run(Claude.TOOL);
  const phases = tooled.filter(
    (event): event is ICodeHudAgentEvent.ITool => event.type === "tool",
  );
  TestValidator.equals("a tool is reported twice", phases.length, 2);
  TestValidator.equals(
    "under one call identifier",
    new Set(phases.map((event) => event.call)).size,
    1,
  );
  TestValidator.equals(
    "starting then finishing",
    phases.map((event) => event.phase),
    ["start", "finish"],
  );
  TestValidator.equals(
    "and the finish carries the description the start made",
    phases[1]!.title,
    phases[0]!.title,
  );
  TestValidator.predicate(
    "which names the tool and what it acted on",
    phases[0]!.title.startsWith("Read ") &&
      phases[0]!.title.includes("notes.txt"),
  );
  TestValidator.equals(
    "a tool that succeeded is not marked failed",
    phases[1]!.failed,
    undefined,
  );

  const refusedPhases = run(Claude.REFUSE).filter(
    (event): event is ICodeHudAgentEvent.ITool => event.type === "tool",
  );
  TestValidator.equals(
    "a tool the wearer refused is marked failed",
    refusedPhases[refusedPhases.length - 1]?.failed,
    true,
  );

  const approval = run(Claude.APPROVE).find(
    (event): event is ICodeHudAgentEvent.IPermission =>
      event.type === "permission",
  );
  const asked: Claude.IEnvelope | undefined = Claude.APPROVE.find(
    (line) => line.request?.subtype === "can_use_tool",
  );
  TestValidator.predicate("an approval was produced", approval !== undefined);
  TestValidator.equals(
    "quoting the harness's own request identifier",
    approval?.request,
    asked?.request_id,
  );
  TestValidator.predicate(
    "and naming the tool it is about",
    approval?.title.startsWith("Write ") === true,
  );
  TestValidator.equals(
    "exactly one option advances the agent",
    approval?.options.filter((option) => option.affirmative === true).length,
    1,
  );
  TestValidator.equals(
    "and none of them persists",
    approval?.options.every((option) => option.persistent === false),
    true,
  );

  const outcome = (stream: Claude.IEnvelope[]): string | undefined =>
    run(stream).find(
      (event): event is ICodeHudAgentEvent.IResult => event.type === "result",
    )?.outcome;
  TestValidator.equals(
    "an allowed turn succeeded",
    outcome(Claude.APPROVE),
    "success",
  );
  TestValidator.equals(
    "a refused turn is interrupted, not failed",
    outcome(Claude.REFUSE),
    "interrupted",
  );

  const reasoning: ICodeHudAgentEvent[] = run(Claude.HOSTED, false);
  TestValidator.predicate(
    "reasoning is its own observation, distinct from prose",
    reasoning.some((event) => event.type === "reasoning") &&
      reasoning.some((event) => event.type === "message"),
  );
}
