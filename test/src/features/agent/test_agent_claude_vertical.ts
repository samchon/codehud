import { CodeHudClaudeNormalizer } from "@codehud/agent";
import type { ICodeHudAgentEvent, ICodeHudState } from "@codehud/interface";
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudReducer,
} from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Claude } from "../internal/claude";
import { Stream } from "../internal/stream";

/**
 * Real harness output reaches the display saying what the harness said.
 *
 * Every other case in this suite checks one boundary. This one runs captured
 * output of `claude 2.1.274` through the whole chain the product is made of,
 * adapter to fold to frame, and asks whether the words that come out the far
 * end are the words that went in. A layer can be individually correct and the
 * chain still wrong, and the seam where that is most likely is the one below.
 *
 * The seam: with partial messages on, the harness reports the same prose twice,
 * once as deltas and once as the completed message. The fold appends whatever
 * it is handed, so an adapter that passed both through would show the wearer
 * every sentence written out twice. The completed block is therefore emitted as
 * a terminator carrying nothing. With partial messages off there are no deltas
 * and the same terminator carries the whole text instead, and both routes have
 * to land on the same state or the setting is a correctness switch rather than
 * a bandwidth one.
 *
 * Scenarios:
 *
 * 1. Folding a streamed turn yields exactly the harness's own final text, once.
 * 2. Streaming on and streaming off reach the same recorded history, so the
 *    choice costs nothing but bandwidth.
 * 3. Replay converges: folding the same observations again, from any counter,
 *    changes nothing.
 * 4. An approval reaches the display as a demand-grade frame naming the tool,
 *    with a hint the wearer can answer out loud.
 * 5. A turn that ran to completion leaves the display idle rather than pending,
 *    with the approval cleared.
 */
export async function test_agent_claude_vertical(): Promise<void> {
  const fold = (
    lines: Claude.IEnvelope[],
    streaming: boolean,
  ): { state: ICodeHudState; events: ICodeHudAgentEvent[] } => {
    const normalizer: CodeHudClaudeNormalizer = new CodeHudClaudeNormalizer(
      "s1",
      () => 0,
    );
    normalizer.streaming = streaming;
    const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
    const events: ICodeHudAgentEvent[] = lines
      .filter((line) => line.__direction !== "host->harness")
      .flatMap((line) =>
        normalizer.normalize(line as CodeHudClaudeNormalizer.ILine),
      );
    return {
      state: events.reduce(
        (acc, event) => reducer.reduce(acc, event),
        reducer.initialize(),
      ),
      events,
    };
  };

  const spoken: string =
    Claude.PARTIAL.find((line) => line.type === "result")?.result ?? "";
  Assert.predicate("the harness said something", spoken.length > 0);

  const streamed = fold(Claude.PARTIAL, true);
  const recorded: string[] = streamed.state.history
    .filter((entry) => entry.kind === "message")
    .map((entry) => entry.title);
  Assert.equals("the display holds what the harness said, once", recorded, [
    spoken,
  ]);
  Assert.equals("and nothing is left half-folded", streamed.state.message, "");

  // The same capture read as though partial messages had been off. The deltas
  // are ignored and the completed block carries the text instead.
  const whole = fold(
    Claude.PARTIAL.filter((line) => line.type !== "stream_event"),
    false,
  );
  Assert.equals(
    "streaming off reaches the same history",
    whole.state.history
      .filter((entry) => entry.kind === "message")
      .map((e) => e.title),
    recorded,
  );

  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const again: ICodeHudState = streamed.events.reduce(
    (acc, event) => reducer.reduce(acc, event),
    streamed.state,
  );
  Assert.equals(
    "replaying the whole turn changes nothing",
    again,
    streamed.state,
  );

  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  const asking = fold(
    Claude.APPROVE.slice(
      0,
      Claude.APPROVE.findIndex(
        (line) => line.request?.subtype === "can_use_tool",
      ) + 1,
    ),
    true,
  );
  const pending = composer.compose(asking.state, Stream.WIDE);
  Assert.equals("an approval demands the wearer", pending.kind, "permission");
  Assert.equals("and says so", pending.urgency, "demand");
  Assert.predicate(
    "naming the tool it is about",
    pending.lines[0]!.text.startsWith("Write"),
  );
  Assert.predicate(
    "with something to say out loud",
    pending.hint !== undefined && pending.hint.includes("Allow"),
  );

  const settled = composer.compose(
    fold(Claude.APPROVE, true).state,
    Stream.WIDE,
  );
  Assert.equals("a finished turn is a result", settled.kind, "result");
  Assert.equals(
    "with no approval still pending",
    fold(Claude.APPROVE, true).state.pending,
    undefined,
  );
}
