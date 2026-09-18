import type { ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * A streaming message accumulates while incomplete and becomes history when it
 * finishes.
 *
 * The display shows the message being written, not a transcript, so the buffer
 * has to survive every partial delta and then empty exactly once.
 *
 * Scenarios:
 *
 * 1. Reasoning sets thinking and leaves the message buffer alone, the arm that
 *    distinguishes internal reasoning from prose addressed to the wearer.
 * 2. An incomplete delta accumulates and leaves the buffer non-empty.
 * 3. Several incomplete deltas concatenate in order.
 * 4. A completing delta empties the buffer and records one history entry
 *    carrying the whole accumulated text.
 * 5. The recorded title is trimmed, since the harness's deltas carry the
 *    spacing of prose rather than of a display line.
 * 6. A completing delta with no prior partial still records, the boundary where
 *    the buffer was empty to begin with.
 */
export async function test_hud_reduce_message(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  const fresh: ICodeHudState = reducer.initialize();

  const thinking: ICodeHudState = reducer.reduce(fresh, Stream.reasoning("hm"));
  Assert.equals("reasoning sets thinking", thinking.activity, "thinking");
  Assert.equals("reasoning leaves the buffer", thinking.message, "");
  Assert.equals("reasoning records nothing", thinking.history.length, 0);

  const one: ICodeHudState = reducer.reduce(
    thinking,
    Stream.message("The ", false),
  );
  Assert.equals("partial sets working", one.activity, "working");
  Assert.equals("partial accumulates", one.message, "The ");
  Assert.equals("partial records nothing", one.history.length, 0);

  const two: ICodeHudState = reducer.reduce(
    one,
    Stream.message("fold  ", false),
  );
  Assert.equals("partials concatenate", two.message, "The fold  ");

  const done: ICodeHudState = reducer.reduce(
    two,
    Stream.message("is pure.", true),
  );
  Assert.equals("completion empties the buffer", done.message, "");
  Assert.equals("completion records one entry", done.history.length, 1);
  Assert.equals("entry kind", done.history[0]!.kind, "message");
  Assert.equals(
    "entry carries the whole message, trimmed",
    done.history[0]!.title,
    "The fold  is pure.",
  );
  Assert.equals("entry is finished", done.history[0]!.done, true);
  Assert.equals("entry did not fail", done.history[0]!.failed, false);

  const solo: ICodeHudState = reducer.reduce(
    reducer.initialize(),
    Stream.message("one shot", true),
  );
  Assert.equals("a lone completion records", solo.history.length, 1);
  Assert.equals("and empties", solo.message, "");
}
