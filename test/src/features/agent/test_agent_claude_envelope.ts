import { TestValidator } from "@nestia/e2e";

import { Claude } from "../internal/claude";

/**
 * What the Claude Code stream actually contains, pinned against drift.
 *
 * Claude Code ships no protocol binding generator, so the adapter cannot be
 * compiled against generated types the way the Codex one can. What stands in
 * for that is this: captures from real invocations of `claude 2.1.274`, and a
 * case that states what an adapter must handle.
 *
 * The point is the recapture. When the harness version moves and these files are
 * taken again, a line kind that did not exist before, a terminal line that stops
 * arriving, or partial text that stops agreeing with the message it belongs to
 * all surface here rather than in front of a wearer. That is the whole reason
 * the issue asked for fixtures rather than for a hand-written type.
 *
 * Scenarios:
 *
 * 1. Every line kind across the captures is one the adapter is on notice for.
 *    Four of them appear in no documentation that prompted this work:
 *    `rate_limit_event`, `system/permission_denied`, `system/status`, and
 *    `system/thinking_tokens`. The same holds for every content block kind, of
 *    which `thinking` is the one a display must decide about.
 * 2. Every declared kind was actually observed. The negative twin: without it
 *    the list could name anything at all and still pass scenario 1.
 * 3. Every capture ends with exactly one terminal `result`, which is the only
 *    thing that tells a bridge the turn is over.
 * 4. Every line names its session, and one capture is one session, which is what
 *    the bridge multiplexes on.
 * 5. A refused tool is reported three times over: a `system/permission_denied`
 *    line, a `tool_result` marked as an error, and an entry in the terminal
 *    line's denial list naming the tool. An adapter may read whichever it likes,
 *    but it must not be surprised by the other two.
 * 6. Partial deltas concatenate to exactly the text of the message they belong
 *    to, and to the terminal result. This is what lets a display fold deltas as
 *    they arrive and still agree with the harness at the end.
 * 7. The completed `assistant` line arrives before the stream's own stop events,
 *    not after them. An adapter that waited for `message_stop` to consider the
 *    message final would be holding text it already had.
 */
export async function test_agent_claude_envelope(): Promise<void> {
  const observed: Set<string> = new Set();
  for (const { name, stream } of Claude.ALL) {
    TestValidator.predicate(`${name} is not empty`, stream.length > 0);
    for (const line of stream) observed.add(Claude.kind(line));

    const terminal: Claude.IEnvelope[] = stream.filter(
      (line) => line.type === "result",
    );
    TestValidator.equals(
      `${name} ends a turn exactly once`,
      terminal.length,
      1,
    );
    TestValidator.equals(
      `${name} ends with that line`,
      Claude.kind(stream[stream.length - 1]!),
      "result/success",
    );

    const sessions: Set<string | undefined> = new Set(
      stream.map((line) => line.session_id),
    );
    TestValidator.equals(`${name} is one session`, sessions.size, 1);
    TestValidator.equals(
      `${name} names it on every line`,
      sessions.has(undefined),
      false,
    );
  }

  for (const seen of observed)
    TestValidator.predicate(
      `${seen} is a kind the adapter is on notice for`,
      Claude.KINDS.includes(seen),
    );
  for (const declared of Claude.KINDS)
    TestValidator.predicate(
      `${declared} was actually observed`,
      observed.has(declared),
    );

  const blocks: Set<string> = new Set(
    Claude.ALL.flatMap(({ stream }) =>
      stream.flatMap((line) =>
        (line.message?.content ?? []).map((block) => block.type),
      ),
    ),
  );
  for (const seen of blocks)
    TestValidator.predicate(
      `the ${seen} block is one the adapter is on notice for`,
      Claude.BLOCKS.includes(seen),
    );
  for (const declared of Claude.BLOCKS)
    TestValidator.predicate(
      `the ${declared} block was actually observed`,
      blocks.has(declared),
    );

  // Measured, and it decided a design question: with nobody hosting the prompt,
  // the harness denies rather than asking, so an approval a wearer could answer
  // is not obtainable from the plain command line as it stands.
  TestValidator.equals(
    "an unhosted approval is refused rather than asked about",
    (
      Claude.HOSTED.find((line) => line.type === "result")
        ?.permission_denials ?? []
    ).map((entry) => entry.tool_name),
    ["Write"],
  );

  TestValidator.predicate(
    "a refusal announces itself on its own line",
    Claude.DENIED.some(
      (line) => Claude.kind(line) === "system/permission_denied",
    ),
  );
  TestValidator.predicate(
    "and comes back as a failed tool result",
    Claude.DENIED.some((line) =>
      (line.message?.content ?? []).some(
        (block) => block.type === "tool_result" && block.is_error === true,
      ),
    ),
  );
  const denials = Claude.DENIED.find(
    (line) => line.type === "result",
  )?.permission_denials;
  TestValidator.equals(
    "and is listed on the terminal line, naming the tool",
    (denials ?? []).map((entry) => entry.tool_name),
    ["Write"],
  );
  TestValidator.equals(
    "a turn that was not refused lists nothing",
    Claude.TOOL.find((line) => line.type === "result")?.permission_denials,
    [],
  );

  const deltas: string = Claude.PARTIAL.filter(
    (line) => line.event?.type === "content_block_delta",
  )
    .map((line) => line.event?.delta?.text ?? "")
    .join("");
  const message: string = Claude.PARTIAL.filter(
    (line) => line.type === "assistant",
  )
    .flatMap((line) => line.message?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  TestValidator.predicate("there were deltas to fold", deltas.length > 0);
  TestValidator.equals(
    "folded deltas equal the completed message",
    deltas,
    message,
  );
  TestValidator.equals(
    "and equal the terminal result",
    deltas,
    Claude.PARTIAL.find((line) => line.type === "result")?.result,
  );

  const kinds: string[] = Claude.PARTIAL.map((line) =>
    line.event === undefined ? Claude.kind(line) : line.event.type,
  );
  TestValidator.predicate(
    "the completed message arrives before the stream stops",
    kinds.indexOf("assistant") < kinds.indexOf("content_block_stop"),
  );
}
