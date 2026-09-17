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
 * 4. Every conversation line names its session, and one capture is one session,
 *    which is what the bridge multiplexes on. Control lines name none, so a
 *    permission request cannot be routed by session: the only thing that says
 *    which conversation is being asked about is which harness process it came
 *    from, which is why one control channel per session is a requirement rather
 *    than a convenience.
 * 8. The approval gate is reachable from an ordinary subprocess. Three things
 *    together make the harness ask, and one of them is a flag value `--help`
 *    does not list: streaming input, `--permission-prompt-tool stdio`, and an
 *    `initialize` control request ahead of the first message. Answered `allow`
 *    the tool runs; answered `deny` it does not. A bridge missing any of the
 *    three is never asked and the tool is refused for it, which is what
 *    `hosted` records.
 * 9. A locally denied tool announces itself with `system/permission_denied`; a
 *    refusal the host gave does not. An adapter watching only that line would
 *    miss every refusal a wearer actually made.
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

    // Only what the harness emitted. The two bidirectional captures also hold
    // the host's own lines, which carry no session and are correlated by
    // request identifier instead.
    const emitted: Claude.IEnvelope[] = stream.filter(
      (line) => line.__direction !== "host->harness",
    );

    const terminal: Claude.IEnvelope[] = emitted.filter(
      (line) => line.type === "result",
    );
    TestValidator.equals(
      `${name} ends a turn exactly once`,
      terminal.length,
      1,
    );
    TestValidator.equals(
      `${name} ends with that line`,
      Claude.kind(emitted[emitted.length - 1]!),
      "result/success",
    );

    // Conversation lines only. Control lines carry no session at all, which is
    // a constraint rather than an omission and is asserted on its own below.
    const sessions: Set<string | undefined> = new Set(
      emitted
        .filter((line) => line.type.startsWith("control_") === false)
        .map((line) => line.session_id),
    );
    TestValidator.equals(`${name} is one session`, sessions.size, 1);
    TestValidator.equals(
      `${name} names it on every conversation line`,
      sessions.has(undefined),
      false,
    );
  }

  // The constraint this puts on the bridge. A permission request names no
  // session, so it cannot be routed by one: the only thing that says which
  // conversation is being asked about is which harness process it arrived
  // from. One control channel per session is therefore not a convenience.
  for (const line of [...Claude.APPROVE, ...Claude.REFUSE])
    if (line.type.startsWith("control_") === true)
      TestValidator.equals(
        `a ${line.type} names no session`,
        line.session_id,
        undefined,
      );

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

  // The shorthand a host may send in is a plain string, and the harness never
  // uses it, so only what the harness emitted contributes block kinds.
  const blocks: Set<string> = new Set(
    Claude.ALL.flatMap(({ stream }) =>
      stream.flatMap((line) => Claude.blocks(line).map((block) => block.type)),
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

  // The three captures that together settle whether a wearer can be asked.
  //
  // `hosted` is a bridge getting it wrong: spawned as an ordinary subprocess
  // with the flag at its default, it is never recognized as a host and the
  // write is denied without anyone being asked. The other two are the same
  // request with the control protocol in place, answered both ways.
  TestValidator.equals(
    "an unrecognized host is never asked, and the write is refused",
    (
      Claude.HOSTED.find((line) => line.type === "result")
        ?.permission_denials ?? []
    ).map((entry) => entry.tool_name),
    ["Write"],
  );
  TestValidator.equals(
    "and nothing was asked of it",
    Claude.HOSTED.filter((line) => line.request?.subtype === "can_use_tool")
      .length,
    0,
  );

  for (const { name, stream, behavior } of [
    { name: "approve", stream: Claude.APPROVE, behavior: "allow" },
    { name: "refuse", stream: Claude.REFUSE, behavior: "deny" },
  ]) {
    const asked: Claude.IEnvelope[] = stream.filter(
      (line) => line.request?.subtype === "can_use_tool",
    );
    TestValidator.equals(`${name} is asked exactly once`, asked.length, 1);
    TestValidator.equals(
      `${name} is asked about the tool by name`,
      asked[0]?.request?.tool_name,
      "Write",
    );
    TestValidator.predicate(
      `${name} is asked with the input the tool would run`,
      asked[0]?.request?.input !== undefined,
    );
    TestValidator.predicate(
      `${name} carries the identifier its answer is paired by`,
      typeof asked[0]?.request_id === "string",
    );

    const answer: Claude.IEnvelope | undefined = stream.find(
      (line) =>
        line.__direction === "host->harness" &&
        line.response?.response?.behavior !== undefined,
    );
    TestValidator.equals(
      `${name} was answered ${behavior}`,
      answer?.response?.response?.behavior,
      behavior,
    );
    TestValidator.equals(
      `${name} answered the question it was asked`,
      answer?.response?.request_id,
      asked[0]?.request_id,
    );
  }

  const failed = (stream: Claude.IEnvelope[]): boolean =>
    stream.some((line) =>
      Claude.blocks(line).some(
        (block) => block.type === "tool_result" && block.is_error === true,
      ),
    );

  TestValidator.equals(
    "an allowed tool runs, and nothing is listed as refused",
    Claude.APPROVE.find((line) => line.type === "result")?.permission_denials,
    [],
  );
  TestValidator.equals(
    "and its result is not an error",
    failed(Claude.APPROVE),
    false,
  );

  TestValidator.equals(
    "a refused tool is listed on the terminal line",
    (
      Claude.REFUSE.find((line) => line.type === "result")
        ?.permission_denials ?? []
    ).map((entry) => entry.tool_name),
    ["Write"],
  );
  TestValidator.equals(
    "and its result is an error",
    failed(Claude.REFUSE),
    true,
  );

  // The distinction an adapter has to respect. `system/permission_denied`
  // reports a local rule deciding; a refusal the wearer made arrives only as
  // the errored result and the terminal list, with no such line at all.
  TestValidator.equals(
    "a locally denied write announces itself on its own line",
    Claude.HOSTED.some(
      (line) => Claude.kind(line) === "system/permission_denied",
    ),
    true,
  );
  TestValidator.equals(
    "a host-refused write does not",
    Claude.REFUSE.some(
      (line) => Claude.kind(line) === "system/permission_denied",
    ),
    false,
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
      Claude.blocks(line).some(
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
    .flatMap((line) => Claude.blocks(line))
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
